// oop_engine.cpp - long-running C++ process used by the Node.js server.
//
// Same protocol as the C engine: one command per stdin line, one JSON object
// per stdout line. Entities live in C++ memory for the whole session.
//
//   PING | RESET | LIST | PLAYER | TYPES
//   CREATE <Type> <id> <x> <y> <param|-> <display name, may contain spaces>
//   GET <id> | REMOVE <id> | MOVE <id> <x> <y>
//   INTERACT <id>
//   REWARD <gold> <xp> <item|-> <count>
//   TAKE <item> <count>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <string>

#include "EntityManager.h"

static void respondError(const std::string &code, const std::string &message)
{
    JsonWriter w;
    w.beginObject().field("ok", false).field("error", code).field("message", message).endObject();
    std::cout << w.str() << '\n';
}

static void writePlayer(JsonWriter &w, EntityManager &mgr)
{
    w.key("player");
    mgr.player().writeJson(w);
}

int main()
{
    std::ios::sync_with_stdio(false);
    EntityManager mgr;
    std::string line;

    while (std::getline(std::cin, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;

        JsonWriter w;
        if (cmd == "PING") {
            w.beginObject().field("ok", true).field("engine", "oop").field("language", "C++").endObject();
        } else if (cmd == "RESET") {
            mgr.reset();
            w.beginObject().field("ok", true).field("op", "reset").endObject();
        } else if (cmd == "TYPES") {
            w.beginObject().field("ok", true).key("types").beginArray();
            for (const auto &t : EntityManager::supportedTypes()) w.value(t);
            w.endArray().endObject();
        } else if (cmd == "CREATE") {
            std::string type, id, param, name;
            double x = 0, y = 0;
            if (!(in >> type >> id >> x >> y >> param)) { respondError("BAD_ARGS", "CREATE <Type> <id> <x> <y> <param> <name>"); std::cout.flush(); continue; }
            std::getline(in >> std::ws, name);
            if (name.empty()) name = id;
            std::string error;
            GameEntity *e = mgr.create(type, id, x, y, param, name, error);
            if (!e) { respondError(error, type + " " + id); std::cout.flush(); continue; }
            w.beginObject().field("ok", true).key("entity");
            e->writeJson(w);
            w.field("liveInstances", GameEntity::liveInstances());
            w.endObject();
        } else if (cmd == "LIST") {
            w.beginObject().field("ok", true).key("entities").beginArray();
            for (const auto &e : mgr.all()) e->writeJson(w);   // polymorphic serialisation
            w.endArray().field("liveInstances", GameEntity::liveInstances()).endObject();
        } else if (cmd == "GET") {
            std::string id;
            in >> id;
            GameEntity *e = mgr.find(id);
            if (!e) { respondError("NOT_FOUND", id); std::cout.flush(); continue; }
            w.beginObject().field("ok", true).key("entity");
            e->writeJson(w);
            w.endObject();
        } else if (cmd == "REMOVE") {
            std::string id;
            in >> id;
            if (!mgr.remove(id)) { respondError("NOT_FOUND", id); std::cout.flush(); continue; }
            w.beginObject().field("ok", true).field("removed", id).field("liveInstances", GameEntity::liveInstances()).endObject();
        } else if (cmd == "MOVE") {
            std::string id;
            double x = 0, y = 0;
            in >> id >> x >> y;
            GameEntity *e = mgr.find(id);
            if (!e) { respondError("NOT_FOUND", id); std::cout.flush(); continue; }
            e->setPosition(x, y);
            w.beginObject().field("ok", true).key("entity");
            e->writeJson(w);
            w.endObject();
        } else if (cmd == "INTERACT") {
            std::string id;
            in >> id;
            GameEntity *e = mgr.find(id);
            if (!e) { respondError("NOT_FOUND", id); std::cout.flush(); continue; }
            // The key line: a GameEntity* calling a virtual function.
            InteractionResult result = e->interact(mgr.player());
            w.beginObject().field("ok", true).key("entity");
            e->writeJson(w);
            w.key("result");
            result.writeJson(w);
            writePlayer(w, mgr);
            w.endObject();
        } else if (cmd == "PLAYER") {
            w.beginObject().field("ok", true);
            writePlayer(w, mgr);
            w.endObject();
        } else if (cmd == "REWARD") {
            int gold = 0, xp = 0, count = 1;
            std::string item = "-";
            in >> gold >> xp >> item >> count;
            mgr.player().addGold(gold);
            mgr.player().addXp(xp);
            if (item != "-" && !item.empty()) mgr.player().addItem(item, count > 0 ? count : 1);
            w.beginObject().field("ok", true);
            writePlayer(w, mgr);
            w.endObject();
        } else if (cmd == "TAKE") {
            std::string item;
            int count = 1;
            in >> item >> count;
            if (!mgr.player().removeItem(item, count)) { respondError("NOT_ENOUGH_ITEMS", item); std::cout.flush(); continue; }
            w.beginObject().field("ok", true);
            writePlayer(w, mgr);
            w.endObject();
        } else if (cmd == "QUIT") {
            break;
        } else {
            respondError("UNKNOWN_COMMAND", cmd);
            std::cout.flush();
            continue;
        }
        std::cout << w.str() << '\n';
        std::cout.flush();
    }
    return 0;
}
