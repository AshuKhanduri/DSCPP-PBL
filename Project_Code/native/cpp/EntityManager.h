// EntityManager.h - owns every entity and creates them through a factory.
// Entities are stored as std::unique_ptr<GameEntity>: the manager only knows
// the base class, and virtual calls pick the right behaviour at run time.
#ifndef ENTITY_MANAGER_H
#define ENTITY_MANAGER_H

#include <memory>
#include <string>
#include <vector>

#include "GameEntity.h"
#include "Player.h"

class EntityManager {
public:
    EntityManager();

    void reset();
    // Factory: returns nullptr and sets `error` if the type is unknown or the id exists.
    GameEntity *create(const std::string &type, const std::string &id, double x, double y,
                       const std::string &param, const std::string &name, std::string &error);
    GameEntity *find(const std::string &id) const;
    bool remove(const std::string &id);
    Player &player() { return *player_; }
    const std::vector<std::unique_ptr<GameEntity>> &all() const { return entities_; }

    static std::vector<std::string> supportedTypes();

private:
    std::vector<std::unique_ptr<GameEntity>> entities_;
    Player *player_ = nullptr;   // non-owning; owned by entities_
};

#endif
