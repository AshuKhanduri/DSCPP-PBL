#include "EntityManager.h"

#include <cstdlib>
#include <sstream>

#include "InteractiveObject.h"
#include "NPC.h"

EntityManager::EntityManager()
{
    reset();
}

void EntityManager::reset()
{
    entities_.clear();
    auto p = std::make_unique<Player>("player", "Player", 0, 0);
    player_ = p.get();
    entities_.push_back(std::move(p));
}

std::vector<std::string> EntityManager::supportedTypes()
{
    return {"Guide", "King", "Blacksmith", "Librarian", "Guard", "Door", "Chest", "QuestObject"};
}

GameEntity *EntityManager::create(const std::string &type, const std::string &id, double x, double y,
                                  const std::string &param, const std::string &name, std::string &error)
{
    if (find(id)) { error = "DUPLICATE_ID"; return nullptr; }
    const std::string p = (param == "-") ? "" : param;

    std::unique_ptr<GameEntity> e;
    if (type == "Guide") e = std::make_unique<Guide>(id, name, x, y);
    else if (type == "King") e = std::make_unique<King>(id, name, x, y);
    else if (type == "Blacksmith") e = std::make_unique<Blacksmith>(id, name, x, y);
    else if (type == "Librarian") e = std::make_unique<Librarian>(id, name, x, y);
    else if (type == "Guard") e = std::make_unique<Guard>(id, name, x, y);
    else if (type == "Door") e = std::make_unique<Door>(id, name, x, y, p);
    else if (type == "QuestObject") e = std::make_unique<QuestObject>(id, name, x, y, p);
    else if (type == "Chest") {
        // param = item:count:gold   e.g. "Map_Fragment:1:25"
        std::string item, count = "1", gold = "0";
        std::stringstream ss(p);
        std::getline(ss, item, ':');
        std::getline(ss, count, ':');
        std::getline(ss, gold, ':');
        e = std::make_unique<Chest>(id, name, x, y, item, std::atoi(count.c_str()), std::atoi(gold.c_str()));
    } else {
        error = "UNKNOWN_TYPE";
        return nullptr;
    }

    GameEntity *raw = e.get();
    entities_.push_back(std::move(e));
    return raw;
}

GameEntity *EntityManager::find(const std::string &id) const
{
    for (const auto &e : entities_)
        if (e->getId() == id) return e.get();
    return nullptr;
}

bool EntityManager::remove(const std::string &id)
{
    if (id == "player") return false;
    for (auto it = entities_.begin(); it != entities_.end(); ++it) {
        if ((*it)->getId() == id) {
            entities_.erase(it);
            return true;
        }
    }
    return false;
}
