// InteractiveObject.h - world objects the player can use.
#ifndef INTERACTIVE_OBJECT_H
#define INTERACTIVE_OBJECT_H

#include "GameEntity.h"

class InteractiveObject : public GameEntity {
public:
    using GameEntity::GameEntity;
    std::string category() const override { return "InteractiveObject"; }
    int getUseCount() const { return useCount_; }

protected:
    void markUsed() { ++useCount_; }
    void writeExtraJson(JsonWriter &w) const override;

private:
    int useCount_ = 0;
};

// Opens only if the player carries `requiredItem` (or if none is required).
class Door : public InteractiveObject {
public:
    Door(std::string id, std::string name, double x, double y, std::string requiredItem);
    std::string typeName() const override { return "Door"; }
    InteractionResult interact(Player &player) override;
    bool isOpen() const { return open_; }

protected:
    void writeExtraJson(JsonWriter &w) const override;

private:
    std::string requiredItem_;
    bool open_ = false;
};

// Gives its contents exactly once.
class Chest : public InteractiveObject {
public:
    Chest(std::string id, std::string name, double x, double y, std::string item, int count, int gold);
    std::string typeName() const override { return "Chest"; }
    InteractionResult interact(Player &player) override;

protected:
    void writeExtraJson(JsonWriter &w) const override;

private:
    std::string item_;
    int count_;
    int gold_;
    bool opened_ = false;
};

// A quest objective. Two modes:
//   COLLECT  - gives `item` once                 (param "collect:Iron_Ore")
//   DELIVER  - consumes `item` x needed, gives `rewardItem`
//                                                (param "deliver:Iron_Ore:3:Iron_Sword")
class QuestObject : public InteractiveObject {
public:
    enum class Mode { Collect, Deliver };
    QuestObject(std::string id, std::string name, double x, double y, const std::string &param);
    std::string typeName() const override { return "QuestObject"; }
    InteractionResult interact(Player &player) override;
    bool isComplete() const { return complete_; }

protected:
    void writeExtraJson(JsonWriter &w) const override;

private:
    Mode mode_ = Mode::Collect;
    std::string item_;
    int needed_ = 1;
    std::string rewardItem_;
    bool complete_ = false;
};

#endif
