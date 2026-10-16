// GameEntity.h - abstract root of the QuestForge entity hierarchy.
//
//   GameEntity (abstract)
//     +-- Character
//     |     +-- Player
//     |     +-- NPC (abstract) -> Guide, King, Blacksmith, Librarian, Guard
//     +-- InteractiveObject (abstract)
//           +-- Door, Chest, QuestObject
#ifndef GAME_ENTITY_H
#define GAME_ENTITY_H

#include <string>
#include <utility>
#include <vector>

#include "JsonWriter.h"

class Player;

// What happened when the player interacted with an entity. Returned by the
// polymorphic interact() call and serialised to JSON for the game.
struct InteractionResult {
    bool success = true;
    std::string action;      // e.g. TALK, DOOR_OPENED, DOOR_LOCKED, CHEST_OPENED
    std::string message;     // line shown to the player
    std::vector<std::pair<std::string, int>> itemsGained;
    std::vector<std::pair<std::string, int>> itemsLost;
    int goldGained = 0;

    void writeJson(JsonWriter &w) const;
};

class GameEntity {
public:
    GameEntity(std::string id, std::string name, double x, double y);
    virtual ~GameEntity();

    // Encapsulated state: read through getters, changed through methods.
    const std::string &getId() const { return id_; }
    const std::string &getName() const { return name_; }
    double getX() const { return x_; }
    double getY() const { return y_; }
    void setPosition(double x, double y);

    // Abstraction: every concrete entity must say what it is and how it reacts.
    virtual std::string typeName() const = 0;
    virtual std::string category() const = 0;
    virtual InteractionResult interact(Player &player) = 0;

    // Template method: common fields here, subclass-specific fields via writeExtraJson().
    void writeJson(JsonWriter &w) const;

    static int liveInstances() { return liveInstances_; }

protected:
    virtual void writeExtraJson(JsonWriter &) const {}

private:
    std::string id_;
    std::string name_;
    double x_;
    double y_;
    static int liveInstances_;
};

#endif
