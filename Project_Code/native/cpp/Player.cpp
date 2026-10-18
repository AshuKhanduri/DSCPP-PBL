#include "Player.h"

Player::Player(std::string id, std::string name, double x, double y)
    : Character(std::move(id), std::move(name), x, y, 100)
{
}

InteractionResult Player::interact(Player &)
{
    InteractionResult r;
    r.action = "SELF";
    r.message = "You look at yourself. Still a hero in progress.";
    return r;
}

void Player::addItem(const std::string &item, int count)
{
    if (count <= 0 || item.empty()) return;
    inventory_[item] += count;
}

bool Player::removeItem(const std::string &item, int count)
{
    auto it = inventory_.find(item);
    if (count <= 0 || it == inventory_.end() || it->second < count) return false;
    it->second -= count;
    if (it->second == 0) inventory_.erase(it);
    return true;
}

int Player::countItem(const std::string &item) const
{
    auto it = inventory_.find(item);
    return it == inventory_.end() ? 0 : it->second;
}

void Player::addGold(int amount)
{
    if (amount > 0) gold_ += amount;
}

void Player::addXp(int amount)
{
    if (amount > 0) xp_ += amount;
}

void Player::writeExtraJson(JsonWriter &w) const
{
    Character::writeExtraJson(w);   // reuse the parent's fields
    w.field("gold", gold_);
    w.field("xp", xp_);
    w.field("level", getLevel());
    w.key("inventory").beginArray();
    for (const auto &it : inventory_) {
        w.beginObject();
        w.field("item", it.first);
        w.field("count", it.second);
        w.endObject();
    }
    w.endArray();
}
