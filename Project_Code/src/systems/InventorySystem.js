// InventorySystem - client-side mirror of the C++ Player object.
// The C++ Player is authoritative (its inventory is private and only changes
// through addItem/removeItem); this class just keeps the latest JSON snapshot.

export function prettyItem(item) {
    return String(item).replace(/_/g, ' ');
}

export class InventorySystem {
    constructor(api, emitter) {
        this.api = api;
        this.emitter = emitter;
        this.player = { gold: 0, xp: 0, level: 1, inventory: [] };
    }

    apply(playerJson) {
        if (!playerJson) return;
        this.player = playerJson;
        this.emitter.emit('inventory-changed', playerJson);
    }

    async refresh() {
        const res = await this.api.oop.player();
        this.apply(res.player);
        return res.player;
    }

    async grant(reward) {
        if (!reward) return this.player;
        const res = await this.api.oop.reward({
            gold: reward.gold ?? 0,
            xp: reward.xp ?? 0,
            item: reward.item ?? null,
            count: reward.count ?? 1,
        });
        this.apply(res.player);
        return res.player;
    }

    count(item) {
        return this.player.inventory.find(i => i.item === item)?.count ?? 0;
    }

    has(item) {
        return this.count(item) > 0;
    }
}
