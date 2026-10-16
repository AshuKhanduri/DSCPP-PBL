#include "Character.h"

#include <algorithm>

Character::Character(std::string id, std::string name, double x, double y, int maxHealth)
    : GameEntity(std::move(id), std::move(name), x, y),
      health_(maxHealth), maxHealth_(maxHealth)
{
}

void Character::takeDamage(int amount)
{
    health_ = std::max(0, health_ - std::max(0, amount));
}

void Character::heal(int amount)
{
    health_ = std::min(maxHealth_, health_ + std::max(0, amount));
}

void Character::writeExtraJson(JsonWriter &w) const
{
    w.field("health", health_);
    w.field("maxHealth", maxHealth_);
}
