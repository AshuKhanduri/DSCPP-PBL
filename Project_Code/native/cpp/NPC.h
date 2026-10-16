// NPC.h - non-player characters.
//
// NPC is abstract: interact() is implemented once here and calls the pure
// virtual greeting(), so each subclass supplies its own behaviour
// (polymorphism) without duplicating the interaction bookkeeping.
#ifndef NPC_H
#define NPC_H

#include "Character.h"

class NPC : public Character {
public:
    NPC(std::string id, std::string name, double x, double y);

    InteractionResult interact(Player &player) override;
    int getTimesTalked() const { return timesTalked_; }

protected:
    // What this NPC says, given the player's current state.
    virtual std::string greeting(const Player &player) const = 0;
    void writeExtraJson(JsonWriter &w) const override;

private:
    int timesTalked_ = 0;
};

class Guide : public NPC {
public:
    using NPC::NPC;
    std::string typeName() const override { return "Guide"; }
protected:
    std::string greeting(const Player &player) const override;
};

class King : public NPC {
public:
    using NPC::NPC;
    std::string typeName() const override { return "King"; }
protected:
    std::string greeting(const Player &player) const override;
};

class Blacksmith : public NPC {
public:
    using NPC::NPC;
    std::string typeName() const override { return "Blacksmith"; }
protected:
    std::string greeting(const Player &player) const override;
};

class Librarian : public NPC {
public:
    using NPC::NPC;
    std::string typeName() const override { return "Librarian"; }
protected:
    std::string greeting(const Player &player) const override;
};

// The Guard overrides interact() itself: it does not just talk, it decides
// whether the player may pass.
class Guard : public NPC {
public:
    using NPC::NPC;
    std::string typeName() const override { return "Guard"; }
    InteractionResult interact(Player &player) override;
protected:
    std::string greeting(const Player &player) const override;
};

#endif
