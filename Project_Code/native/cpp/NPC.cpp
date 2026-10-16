#include "NPC.h"

#include "Player.h"

NPC::NPC(std::string id, std::string name, double x, double y)
    : Character(std::move(id), std::move(name), x, y, 50)
{
}

InteractionResult NPC::interact(Player &player)
{
    ++timesTalked_;
    InteractionResult r;
    r.action = "TALK";
    r.message = greeting(player);   // dynamic dispatch to the subclass
    return r;
}

void NPC::writeExtraJson(JsonWriter &w) const
{
    Character::writeExtraJson(w);
    w.field("timesTalked", timesTalked_);
}

std::string Guide::greeting(const Player &player) const
{
    if (getTimesTalked() <= 1) return "Welcome, traveller! Paths here twist like roots - let me help you find your way.";
    if (player.getLevel() > 1) return "You are learning fast. Level " + std::to_string(player.getLevel()) + " already!";
    return "Remember: when lost, explore level by level - the nearest places first.";
}

std::string King::greeting(const Player &player) const
{
    if (player.hasItem("Royal_Seal")) return "Ah, bearer of my seal. The kingdom is in your debt.";
    if (player.getGold() >= 100) return "A well-funded adventurer! The treasury approves.";
    return "Kneel, traveller. Few are granted an audience with the crown.";
}

std::string Blacksmith::greeting(const Player &player) const
{
    if (player.hasItem("Iron_Sword")) return "That blade still sings. Treat it well.";
    int ore = player.countItem("Iron_Ore");
    if (ore > 0) return "I see " + std::to_string(ore) + " iron ore in your pack. The anvil awaits.";
    return "Hammer, heat, patience. That is all smithing is.";
}

std::string Librarian::greeting(const Player &player) const
{
    if (player.hasItem("Lost_Ledger")) return "You found the ledger! Please, handle it gently.";
    return "Shh. Every record here has its place. Most of them, anyway.";
}

std::string Guard::greeting(const Player &player) const
{
    if (player.hasItem("Royal_Seal")) return "The Royal Seal! The Tower of Trials is open to you.";
    return "Halt! Only bearers of the Royal Seal may attempt the Tower of Trials.";
}

InteractionResult Guard::interact(Player &player)
{
    InteractionResult r = NPC::interact(player);   // reuse base bookkeeping
    bool allowed = player.hasItem("Royal_Seal");
    r.action = allowed ? "GUARD_ALLOWS" : "GUARD_BLOCKS";
    r.success = allowed;
    return r;
}
