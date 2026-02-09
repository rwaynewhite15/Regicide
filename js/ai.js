/**
 * Regicide - Cooperative AI Partner
 * 
 * The AI acts as a cooperative partner, making strategic decisions
 * to help defeat the enemy royals together with the human player.
 */

class RegicideAI {
    constructor(game, playerIndex) {
        this.game = game;
        this.playerIndex = playerIndex;
    }

    /**
     * Decide what to do on the AI's turn.
     * Returns an action: { type: 'play', cardIds: [...] } or { type: 'yield', cardId: ... }
     */
    decidePlay() {
        const state = this.game.getState();
        const hand = state.hands[this.playerIndex];
        const enemy = state.currentEnemy;
        
        if (!enemy || hand.length === 0) {
            return { type: 'yield', cardId: null };
        }

        const enemyHP = state.currentEnemyHP;
        const effectiveAttack = state.effectiveAttack;

        // Strategy priorities:
        // 1. If we can kill the enemy exactly (HP = 0 for discard recovery), do it
        // 2. If we can kill the enemy, do it
        // 3. Play spades to reduce attack if it's high
        // 4. Play diamonds to draw cards if hand is small
        // 5. Play hearts to recover cards
        // 6. Play the most efficient damage card

        // Find all valid plays
        const plays = this.getAllValidPlays(hand);

        if (plays.length === 0) {
            // Must yield - discard lowest value card
            const sorted = [...hand].sort((a, b) => cardValue(a) - cardValue(b));
            return { type: 'yield', cardId: sorted[0].id };
        }

        // Score each play
        let bestPlay = null;
        let bestScore = -Infinity;

        for (const play of plays) {
            const score = this.scorePlay(play, state);
            if (score > bestScore) {
                bestScore = score;
                bestPlay = play;
            }
        }

        if (bestPlay && bestScore > -50) {
            return { type: 'play', cardIds: bestPlay.map(c => c.id) };
        }

        // Yield if no good play
        const sorted = [...hand].sort((a, b) => cardValue(a) - cardValue(b));
        return { type: 'yield', cardId: sorted[0].id };
    }

    /**
     * Decide which cards to discard during enemy attack phase.
     */
    decideDiscard() {
        const state = this.game.getState();
        const hand = state.hands[this.playerIndex];
        const needed = state.discardNeeded - state.discardedSoFar.reduce((s, c) => s + cardValue(c), 0);

        if (hand.length === 0 || needed <= 0) {
            return [];
        }

        // Try to find the optimal set of cards that meets the requirement
        // with minimal waste (closest to exact amount)
        const result = this.findOptimalDiscard(hand, needed);
        return result.map(c => c.id);
    }

    /**
     * Find the minimum waste discard combination.
     */
    findOptimalDiscard(hand, needed) {
        // First try: single card that covers the need
        const singles = hand.filter(c => cardValue(c) >= needed);
        if (singles.length > 0) {
            // Pick the one closest to needed (minimize waste)
            singles.sort((a, b) => cardValue(a) - cardValue(b));
            return [singles[0]];
        }

        // Try pairs
        const sorted = [...hand].sort((a, b) => cardValue(b) - cardValue(a));
        
        // Greedy: keep adding highest value cards until we meet the need
        const result = [];
        let total = 0;
        for (const card of sorted) {
            result.push(card);
            total += cardValue(card);
            if (total >= needed) break;
        }

        if (total >= needed) return result;

        // Can't meet the requirement - return entire hand
        return [...hand];
    }

    /**
     * Get all valid single and combo plays from a hand.
     */
    getAllValidPlays(hand) {
        const plays = [];

        // Single cards
        for (const card of hand) {
            plays.push([card]);
        }

        // Group cards by rank
        const byRank = {};
        for (const card of hand) {
            if (!byRank[card.rank]) byRank[card.rank] = [];
            byRank[card.rank].push(card);
        }

        // Same-rank combos (pairs, triples, quads)
        for (const rank in byRank) {
            const group = byRank[rank];
            if (group.length >= 2) {
                // Generate all pairs
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        plays.push([group[i], group[j]]);
                    }
                }
                // Triples
                if (group.length >= 3) {
                    for (let i = 0; i < group.length; i++) {
                        for (let j = i + 1; j < group.length; j++) {
                            for (let k = j + 1; k < group.length; k++) {
                                plays.push([group[i], group[j], group[k]]);
                            }
                        }
                    }
                }
                // Quads
                if (group.length >= 4) {
                    plays.push([...group]);
                }
            }
        }

        // Animal Companion combos: Aces + single non-Ace card
        const aces = byRank['A'] || [];
        if (aces.length > 0) {
            // Get all non-Ace cards
            const nonAces = hand.filter(c => c.rank !== 'A');
            
            // For each non-Ace card, generate combos with 1-3 Aces (max 4 cards total)
            for (const nonAce of nonAces) {
                // Single Ace + non-Ace
                for (const ace of aces) {
                    plays.push([ace, nonAce]);
                }
                
                // Two Aces + non-Ace
                if (aces.length >= 2) {
                    for (let i = 0; i < aces.length; i++) {
                        for (let j = i + 1; j < aces.length; j++) {
                            plays.push([aces[i], aces[j], nonAce]);
                        }
                    }
                }
                
                // Three Aces + non-Ace
                if (aces.length >= 3) {
                    for (let i = 0; i < aces.length; i++) {
                        for (let j = i + 1; j < aces.length; j++) {
                            for (let k = j + 1; k < aces.length; k++) {
                                plays.push([aces[i], aces[j], aces[k], nonAce]);
                            }
                        }
                    }
                }
            }
        }

        // Filter to only valid combos
        return plays.filter(play => isValidCombo(play));
    }

    /**
     * Score a potential play based on strategic value.
     */
    scorePlay(cards, state) {
        const damage = cards.reduce((s, c) => s + cardValue(c), 0);
        const suits = [...new Set(cards.map(c => c.suit))];
        const enemyHP = state.currentEnemyHP;
        const effectiveAttack = state.effectiveAttack;
        const handSize = state.hands[this.playerIndex].length;
        const tavernCount = state.tavernCount;

        let totalDamage = damage;
        if (suits.includes('clubs')) totalDamage = damage * 2;

        let score = 0;

        // Killing bonus - huge priority
        if (totalDamage >= enemyHP) {
            score += 100;
            // Exact kill bonus (enemy goes to discard for potential recovery)
            if (totalDamage === enemyHP) {
                score += 50;
            }
            // Prefer using fewer cards to kill
            score -= cards.length * 5;
            return score;
        }

        // Base damage score
        score += totalDamage * 2;

        // Suit bonuses based on situation
        if (suits.includes('spades') && effectiveAttack > 5) {
            // Spades are great when enemy attack is high
            score += damage * 3;
        }

        if (suits.includes('diamonds') && handSize < 4) {
            // Diamonds are great when hand is low
            score += damage * 2;
        }

        if (suits.includes('hearts') && state.discardCount > 3) {
            // Hearts are great when discard pile has cards
            score += damage * 1.5;
        }

        if (suits.includes('clubs')) {
            // Clubs are always decent for damage
            score += damage;
        }

        // Penalize playing too many cards at once (conservation)
        score -= cards.length * 3;

        // Penalize playing high value cards early against weak enemies
        if (state.currentEnemy.rank === 'J') {
            // Don't waste big cards on Jacks
            if (damage > 7) score -= (damage - 7) * 2;
        }

        // Penalize if the effective attack after play would be devastating
        // and we don't have spades
        const attackAfter = effectiveAttack;
        if (attackAfter > 10 && !suits.includes('spades')) {
            score -= attackAfter;
        }

        // Consider if we can survive the enemy attack after playing
        const handAfterPlay = state.hands[this.playerIndex].length - cards.length;
        const handValueAfterPlay = state.hands[this.playerIndex]
            .filter(c => !cards.includes(c))
            .reduce((s, c) => s + cardValue(c), 0);
        
        if (handValueAfterPlay < attackAfter && attackAfter > 0) {
            // We might die after this play
            score -= 30;
        }

        return score;
    }
}

if (typeof window !== 'undefined') {
    window.RegicideAI = RegicideAI;
}
