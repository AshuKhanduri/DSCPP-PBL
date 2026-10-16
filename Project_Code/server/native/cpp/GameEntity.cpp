#include "GameEntity.h"

int GameEntity::liveInstances_ = 0;

GameEntity::GameEntity(std::string id, std::string name, double x, double y)
    : id_(std::move(id)), name_(std::move(name)), x_(x), y_(y)
{
    ++liveInstances_;
}

GameEntity::~GameEntity()
{
    --liveInstances_;
}

void GameEntity::setPosition(double x, double y)
{
    x_ = x;
    y_ = y;
}

void GameEntity::writeJson(JsonWriter &w) const
{
    w.beginObject();
    w.field("id", id_);
    w.field("name", name_);
    w.field("type", typeName());       // virtual call - resolved at run time
    w.field("category", category());
    w.field("x", x_);
    w.field("y", y_);
    writeExtraJson(w);
    w.endObject();
}

static void writeItems(JsonWriter &w, const std::vector<std::pair<std::string, int>> &items)
{
    w.beginArray();
    for (const auto &it : items) {
        w.beginObject();
        w.field("item", it.first);
        w.field("count", it.second);
        w.endObject();
    }
    w.endArray();
}

void InteractionResult::writeJson(JsonWriter &w) const
{
    w.beginObject();
    w.field("success", success);
    w.field("action", action);
    w.field("message", message);
    w.field("goldGained", goldGained);
    w.key("itemsGained");
    writeItems(w, itemsGained);
    w.key("itemsLost");
    writeItems(w, itemsLost);
    w.endObject();
}
