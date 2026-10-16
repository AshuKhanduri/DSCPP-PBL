#include "InteractiveObject.h"

#include <algorithm>
#include <cstdlib>
#include <sstream>

#include "Player.h"

static std::string pretty(const std::string &item)
{
    std::string s = item;
    for (char &c : s) if (c == '_') c = ' ';
    return s;
}

void InteractiveObject::writeExtraJson(JsonWriter &w) const
{
    w.field("useCount", useCount_);
}

// ------------------------------------------------------------------ Door

Door::Door(std::string id, std::string name, double x, double y, std::string requiredItem)
    : InteractiveObject(std::move(id), std::move(name), x, y), requiredItem_(std::move(requiredItem))
{
}

InteractionResult Door::interact(Player &player)
{
    markUsed();
    InteractionResult r;
    if (open_) {
        r.action = "DOOR_OPEN";
        r.message = getName() + " is already open.";
    } else if (requiredItem_.empty() || player.hasItem(requiredItem_)) {
        open_ = true;
        r.action = "DOOR_OPENED";
        r.message = requiredItem_.empty() ? getName() + " swings open."
                                          : "The " + pretty(requiredItem_) + " glows. " + getName() + " opens.";
    } else {
        r.success = false;
        r.action = "DOOR_LOCKED";
        r.message = getName() + " is locked. It requires: " + pretty(requiredItem_) + ".";
    }
    return r;
}

void Door::writeExtraJson(JsonWriter &w) const
{
    InteractiveObject::writeExtraJson(w);
    w.field("open", open_);
    w.field("requiredItem", requiredItem_);
}

// ----------------------------------------------------------------- Chest

Chest::Chest(std::string id, std::string name, double x, double y, std::string item, int count, int gold)
    : InteractiveObject(std::move(id), std::move(name), x, y), item_(std::move(item)), count_(count), gold_(gold)
{
}

InteractionResult Chest::interact(Player &player)
{
    markUsed();
    InteractionResult r;
    if (opened_) {
        r.success = false;
        r.action = "CHEST_EMPTY";
        r.message = getName() + " is empty.";
        return r;
    }
    opened_ = true;
    r.action = "CHEST_OPENED";
    std::ostringstream msg;
    msg << "You open " << getName() << ".";
    if (!item_.empty() && count_ > 0) {
        player.addItem(item_, count_);
        r.itemsGained.push_back({item_, count_});
        msg << " Found " << count_ << " x " << pretty(item_) << ".";
    }
    if (gold_ > 0) {
        player.addGold(gold_);
        r.goldGained = gold_;
        msg << " +" << gold_ << " gold.";
    }
    r.message = msg.str();
    return r;
}

void Chest::writeExtraJson(JsonWriter &w) const
{
    InteractiveObject::writeExtraJson(w);
    w.field("opened", opened_);
}

// ----------------------------------------------------------- QuestObject

static std::vector<std::string> split(const std::string &s, char sep)
{
    std::vector<std::string> parts;
    std::stringstream ss(s);
    std::string part;
    while (std::getline(ss, part, sep)) parts.push_back(part);
    return parts;
}

QuestObject::QuestObject(std::string id, std::string name, double x, double y, const std::string &param)
    : InteractiveObject(std::move(id), std::move(name), x, y)
{
    auto parts = split(param, ':');
    if (!parts.empty() && parts[0] == "deliver") {
        mode_ = Mode::Deliver;
        if (parts.size() > 1) item_ = parts[1];
        if (parts.size() > 2) needed_ = std::max(1, std::atoi(parts[2].c_str()));
        if (parts.size() > 3) rewardItem_ = parts[3];
    } else {
        mode_ = Mode::Collect;
        if (parts.size() > 1) item_ = parts[1];
    }
}

InteractionResult QuestObject::interact(Player &player)
{
    markUsed();
    InteractionResult r;
    if (complete_) {
        r.success = false;
        r.action = "ALREADY_DONE";
        r.message = "Nothing more to do with " + getName() + ".";
        return r;
    }
    if (mode_ == Mode::Collect) {
        complete_ = true;
        player.addItem(item_);
        r.action = "ITEM_COLLECTED";
        r.itemsGained.push_back({item_, 1});
        r.message = "Collected " + pretty(item_) + ".";
        return r;
    }
    // Deliver mode
    int have = player.countItem(item_);
    if (have < needed_) {
        r.success = false;
        r.action = "MISSING_ITEMS";
        r.message = "Needs " + std::to_string(needed_) + " x " + pretty(item_) + " (you have " + std::to_string(have) + ").";
        return r;
    }
    player.removeItem(item_, needed_);
    r.itemsLost.push_back({item_, needed_});
    if (!rewardItem_.empty()) {
        player.addItem(rewardItem_);
        r.itemsGained.push_back({rewardItem_, 1});
    }
    complete_ = true;
    r.action = "ITEM_DELIVERED";
    r.message = "Delivered " + std::to_string(needed_) + " x " + pretty(item_) +
                (rewardItem_.empty() ? "." : ". Received " + pretty(rewardItem_) + "!");
    return r;
}

void QuestObject::writeExtraJson(JsonWriter &w) const
{
    InteractiveObject::writeExtraJson(w);
    w.field("mode", mode_ == Mode::Collect ? "COLLECT" : "DELIVER");
    w.field("item", item_);
    w.field("needed", needed_);
    w.field("complete", complete_);
}
