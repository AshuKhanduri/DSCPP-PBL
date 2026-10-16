// Player.h - the player character. Owns the inventory, gold and XP.
// The inventory is private: other classes can only change it through
// addItem / removeItem, which enforce the rules (no negative counts).
#ifndef PLAYER_H
#define PLAYER_H

#include <map>

#include "Character.h"

class Player : public Character {
public:
    Player(std::string id, std::string name, double x, double y);

    std::string typeName() const override { return "Player"; }
    InteractionResult interact(Player &player) override;

    void addItem(const std::string &item, int count = 1);
    bool removeItem(const std::string &item, int count = 1);   // false if not enough
    int countItem(const std::string &item) const;
    bool hasItem(const std::string &item) const { return countItem(item) > 0; }

    void addGold(int amount);
    void addXp(int amount);
    int getGold() const { return gold_; }
    int getXp() const { return xp_; }
    int getLevel() const { return 1 + xp_ / 100; }

protected:
    void writeExtraJson(JsonWriter &w) const override;

private:
    std::map<std::string, int> inventory_;
    int gold_ = 0;
    int xp_ = 0;
};

#endif
