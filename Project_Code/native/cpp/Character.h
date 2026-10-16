// Character.h - anything with health and a role (players and NPCs).
#ifndef CHARACTER_H
#define CHARACTER_H

#include "GameEntity.h"

class Character : public GameEntity {
public:
    Character(std::string id, std::string name, double x, double y, int maxHealth);

    std::string category() const override { return "Character"; }

    int getHealth() const { return health_; }
    int getMaxHealth() const { return maxHealth_; }
    bool isAlive() const { return health_ > 0; }
    void takeDamage(int amount);
    void heal(int amount);

protected:
    void writeExtraJson(JsonWriter &w) const override;

private:
    int health_;
    int maxHealth_;
};

#endif
