/**
 * Regicide - Core Game Engine
 * 
 * Regicide is a cooperative card game for 1-4 players.
 * Players work together to defeat 12 enemy royals (Jacks, Queens, Kings)
 * using a standard 52-card deck.
 * 
 * Rules Summary:
 * - Enemies are faced in order: 4 Jacks, 4 Queens, 4 Kings
 * - Enemy HP: Jack=20, Queen=30, King=40
 * - Enemy Attack: Jack=10, Queen=15, King=20
 * - Players play cards to deal damage (card value = damage)
 * - Suit powers: Hearts=heal, Diamonds=draw, Clubs=double damage, Spades=shield
 * - After playing, the enemy attacks and players must discard cards equal to attack value
 * - If a player can't discard enough, the game is lost
 * - Defeat all 12 enemies to win
 */

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS = { hearts: '#e74c3c', diamonds: '#e74c3c', clubs: '#2c3e50', spades: '#2c3e50' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const FACE_RANKS = ['J', 'Q', 'K'];

function cardValue(card) {
    if (card.rank === 'A') return 1;
    if (card.rank === 'J') return 10;
    if (card.rank === 'Q') return 15;
    if (card.rank === 'K') return 20;
    return parseInt(card.rank);
}

function enemyMaxHP(card) {
    if (card.rank === 'J') return 20;
    if (card.rank === 'Q') return 30;
    if (card.rank === 'K') return 40;
    return 0;
}

function enemyAttack(card) {
    if (card.rank === 'J') return 10;
    if (card.rank === 'Q') return 15;
    if (card.rank === 'K') return 20;
    return 0;
}

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank, id: `${rank}_${suit}` });
        }
    }
    return deck;
}

function createEnemyDeck() {
    const enemies = [];
    for (const rank of FACE_RANKS) {
        for (const suit of SUITS) {
            enemies.push({ suit, rank, id: `${rank}_${suit}` });
        }
    }
    // Shuffle within each rank tier, then stack: Jacks on top, then Queens, then Kings
    const jacks = enemies.filter(c => c.rank === 'J');
    const queens = enemies.filter(c => c.rank === 'Q');
    const kings = enemies.filter(c => c.rank === 'K');
    shuffle(jacks);
    shuffle(queens);
    shuffle(kings);
    return [...jacks, ...queens, ...kings];
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Check if a set of cards forms a valid combo.
 * Valid combos:
 * - Single card (any)
 * - Pair of same rank (non-face, non-Ace) - total must be ≤ 10
 * - Animal companion pairs: pairs of Aces
 * - Multiple cards of same rank (2-4 of same value) - total must be ≤ 10
 */
function isValidCombo(cards) {
    if (cards.length === 0) return false;
    if (cards.length === 1) return true;
    // All cards must have the same rank
    const rank = cards[0].rank;
    if (!cards.every(c => c.rank === rank)) return false;
    // Face cards cannot be played from hand (they are enemies)
    if (FACE_RANKS.includes(rank)) return false;
    // Allow pairs/triples/quads of same rank
    if (cards.length > 4) return false;
    // Same-rank sets can only add up to 10
    const total = cards.reduce((sum, c) => sum + cardValue(c), 0);
    return total <= 10;
}

function comboValue(cards) {
    return cards.reduce((sum, c) => sum + cardValue(c), 0);
}

function comboSuits(cards) {
    return [...new Set(cards.map(c => c.suit))];
}

class RegicideGame {
    constructor(playerCount = 2) {
        this.playerCount = playerCount;
        this.reset();
    }

    reset() {
        this.tavern = shuffle(createDeck());
        this.castle = createEnemyDeck();
        this.discard = [];
        this.hands = [];
        this.currentPlayer = 0;
        this.phase = 'play'; // 'play', 'discard', 'gameover', 'victory'
        this.currentEnemy = null;
        this.currentEnemyHP = 0;
        this.currentEnemyMaxHP = 0;
        this.currentEnemyAttack = 0;
        this.shieldAmount = 0;
        this.log = [];
        this.discardNeeded = 0;
        this.discardedSoFar = [];
        this.enemiesDefeated = 0;
        this.yieldUsed = false;

        // Deal hands
        const handSize = this.playerCount === 1 ? 8 : (this.playerCount === 2 ? 7 : (this.playerCount === 3 ? 6 : 5));
        for (let i = 0; i < this.playerCount; i++) {
            this.hands.push([]);
            for (let j = 0; j < handSize; j++) {
                if (this.tavern.length > 0) {
                    this.hands[i].push(this.tavern.pop());
                }
            }
        }

        // Reveal first enemy
        this.revealEnemy();
    }

    revealEnemy() {
        if (this.castle.length === 0) {
            this.phase = 'victory';
            this.addLog('🎉 All enemies defeated! Victory!');
            return;
        }
        this.currentEnemy = this.castle.shift();
        this.currentEnemyHP = enemyMaxHP(this.currentEnemy);
        this.currentEnemyMaxHP = this.currentEnemyHP;
        this.currentEnemyAttack = enemyAttack(this.currentEnemy);
        this.shieldAmount = 0;
        this.addLog(`⚔️ A ${this.currentEnemy.rank}${SUIT_SYMBOLS[this.currentEnemy.suit]} appears! HP: ${this.currentEnemyHP}, Attack: ${this.currentEnemyAttack}`);
    }

    addLog(msg) {
        this.log.push(msg);
        if (this.log.length > 50) this.log.shift();
    }

    getHand(playerIndex) {
        return this.hands[playerIndex] || [];
    }

    canYield() {
        // Player can yield (play no cards) only if they have already played at least once
        // In the actual game, yielding means discarding a card to the discard pile
        // For simplicity: player can yield their turn, but must discard 1 card
        return this.phase === 'play';
    }

    /**
     * Play a combo of cards against the current enemy.
     * Returns { success, message, events }
     */
    playCards(playerIndex, cardIds) {
        if (this.phase !== 'play') {
            return { success: false, message: 'Not in play phase' };
        }
        if (playerIndex !== this.currentPlayer) {
            return { success: false, message: 'Not your turn' };
        }

        const hand = this.hands[playerIndex];
        const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
        
        if (cards.length !== cardIds.length) {
            return { success: false, message: 'Invalid cards selected' };
        }

        if (!isValidCombo(cards)) {
            return { success: false, message: 'Invalid card combination. Play a single card or multiple cards of the same rank.' };
        }

        const damage = comboValue(cards);
        const suits = comboSuits(cards);
        const events = [];

        // Remove cards from hand
        for (const card of cards) {
            const idx = hand.indexOf(card);
            if (idx !== -1) hand.splice(idx, 1);
        }

        const cardNames = cards.map(c => `${c.rank}${SUIT_SYMBOLS[c.suit]}`).join(', ');
        this.addLog(`Player ${playerIndex + 1} plays ${cardNames}`);

        // Apply suit powers
        let totalDamage = damage;
        let doubled = false;

        // Clubs: double the damage
        if (suits.includes('clubs')) {
            totalDamage = damage * 2;
            doubled = true;
            events.push({ type: 'clubs', message: `♣ Clubs doubles damage to ${totalDamage}!` });
            this.addLog(`♣ Damage doubled to ${totalDamage}!`);
        }

        // Apply damage to enemy
        this.currentEnemyHP -= totalDamage;
        events.push({ type: 'damage', amount: totalDamage, message: `Dealt ${totalDamage} damage!` });
        this.addLog(`💥 Dealt ${totalDamage} damage! Enemy HP: ${Math.max(0, this.currentEnemyHP)}`);

        // Diamonds: draw cards
        if (suits.includes('diamonds')) {
            const drawCount = Math.min(damage, this.tavern.length);
            const totalHandCards = this.hands.reduce((sum, h) => sum + h.length, 0);
            // Draw cards, distributing starting with current player
            let drawn = 0;
            for (let i = 0; i < drawCount; i++) {
                if (this.tavern.length > 0) {
                    const targetPlayer = (playerIndex + i) % this.playerCount;
                    this.hands[targetPlayer].push(this.tavern.pop());
                    drawn++;
                }
            }
            if (drawn > 0) {
                events.push({ type: 'diamonds', message: `♦ Drew ${drawn} card(s)!` });
                this.addLog(`♦ Drew ${drawn} card(s)!`);
            }
        }

        // Spades: reduce enemy attack (shield)
        if (suits.includes('spades')) {
            this.shieldAmount += damage;
            const effectiveAttack = Math.max(0, this.currentEnemyAttack - this.shieldAmount);
            events.push({ type: 'spades', message: `♠ Shield! Enemy attack reduced to ${effectiveAttack}` });
            this.addLog(`♠ Enemy attack reduced to ${effectiveAttack}!`);
        }

        // Hearts: heal from discard pile to tavern bottom
        if (suits.includes('hearts')) {
            const healCount = Math.min(damage, this.discard.length);
            for (let i = 0; i < healCount; i++) {
                if (this.discard.length > 0) {
                    this.tavern.unshift(this.discard.pop());
                }
            }
            if (healCount > 0) {
                events.push({ type: 'hearts', message: `♥ Shuffled ${healCount} card(s) from discard to tavern!` });
                this.addLog(`♥ Shuffled ${healCount} card(s) back to tavern!`);
            }
        }

        // Check if enemy is defeated
        if (this.currentEnemyHP <= 0) {
            events.push({ type: 'defeat', message: `${this.currentEnemy.rank}${SUIT_SYMBOLS[this.currentEnemy.suit]} defeated!` });
            this.addLog(`👑 ${this.currentEnemy.rank}${SUIT_SYMBOLS[this.currentEnemy.suit]} has been defeated!`);
            this.enemiesDefeated++;

            // Played cards go to discard
            for (const card of cards) {
                this.discard.push(card);
            }

            // If enemy HP is exactly 0, enemy card goes to discard (can be healed back)
            if (this.currentEnemyHP === 0) {
                this.discard.push(this.currentEnemy);
                this.addLog(`The ${this.currentEnemy.rank}${SUIT_SYMBOLS[this.currentEnemy.suit]} joins the discard pile.`);
            }
            // If overkill, enemy is removed from game

            // Move to next enemy
            this.phase = 'play';
            this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
            this.revealEnemy();
            
            return { success: true, events, defeated: true };
        }

        // Played cards go to discard
        for (const card of cards) {
            this.discard.push(card);
        }

        // Enemy attacks - calculate damage to absorb
        const effectiveAttack = Math.max(0, this.currentEnemyAttack - this.shieldAmount);
        
        if (effectiveAttack > 0) {
            this.discardNeeded = effectiveAttack;
            this.discardedSoFar = [];
            this.phase = 'discard';
            events.push({ type: 'enemy_attack', amount: effectiveAttack, message: `Enemy attacks for ${effectiveAttack}! Discard cards totaling ${effectiveAttack}.` });
            this.addLog(`⚡ Enemy attacks for ${effectiveAttack}! Discard cards to survive.`);

            // Check if player can survive
            const totalHandValue = this.hands[this.currentPlayer].reduce((s, c) => s + cardValue(c), 0);
            if (totalHandValue < effectiveAttack && this.hands[this.currentPlayer].length > 0) {
                // Must discard entire hand
                this.addLog(`Player ${this.currentPlayer + 1} cannot fully absorb the attack.`);
            }
            if (this.hands[this.currentPlayer].length === 0 && effectiveAttack > 0) {
                // Check if any player has cards
                const anyoneHasCards = this.hands.some(h => h.length > 0);
                if (!anyoneHasCards && this.tavern.length === 0) {
                    this.phase = 'gameover';
                    events.push({ type: 'gameover', message: 'No cards left to absorb damage. Game Over!' });
                    this.addLog('💀 Game Over! No cards to absorb damage.');
                }
            }
        } else {
            // No damage to absorb, next player's turn
            events.push({ type: 'shielded', message: 'Attack fully shielded!' });
            this.addLog('🛡️ Attack fully shielded!');
            this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
        }

        return { success: true, events };
    }

    /**
     * Discard cards to absorb enemy attack damage.
     * Cards discarded must total at least the required amount.
     */
    discardCards(playerIndex, cardIds) {
        if (this.phase !== 'discard') {
            return { success: false, message: 'Not in discard phase' };
        }
        if (playerIndex !== this.currentPlayer) {
            return { success: false, message: 'Not your turn to discard' };
        }

        const hand = this.hands[playerIndex];
        const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);

        if (cards.length === 0) {
            return { success: false, message: 'No valid cards selected' };
        }

        const discardValue = cards.reduce((s, c) => s + cardValue(c), 0);
        const totalSoFar = this.discardedSoFar.reduce((s, c) => s + cardValue(c), 0) + discardValue;

        // Remove from hand and add to discard
        for (const card of cards) {
            const idx = hand.indexOf(card);
            if (idx !== -1) {
                hand.splice(idx, 1);
                this.discard.push(card);
                this.discardedSoFar.push(card);
            }
        }

        const cardNames = cards.map(c => `${c.rank}${SUIT_SYMBOLS[c.suit]}`).join(', ');
        this.addLog(`Player ${playerIndex + 1} discards ${cardNames} (${discardValue} damage absorbed)`);

        if (totalSoFar >= this.discardNeeded) {
            // Survived the attack
            this.phase = 'play';
            this.discardNeeded = 0;
            this.discardedSoFar = [];
            this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
            this.addLog(`Player survives! Next player's turn.`);
            return { success: true, survived: true, message: 'Attack survived!' };
        }

        // Need more discards - check if player has enough
        const remaining = this.discardNeeded - totalSoFar;
        const handValue = hand.reduce((s, c) => s + cardValue(c), 0);

        if (hand.length === 0) {
            // Player ran out of cards - check if survived
            if (totalSoFar >= this.discardNeeded) {
                this.phase = 'play';
                this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
                return { success: true, survived: true, message: 'Attack survived!' };
            }
            // Game over - can't absorb enough
            this.phase = 'gameover';
            this.addLog('💀 Game Over! Could not absorb enough damage.');
            return { success: true, gameover: true, message: 'Game Over! Not enough cards to survive.' };
        }

        return { success: true, remaining, message: `Need ${remaining} more damage to absorb.` };
    }

    /**
     * Player yields their turn (plays no attack cards).
     * Must discard 1 card, then the enemy attacks.
     */
    yieldTurn(playerIndex, discardCardId) {
        if (this.phase !== 'play') {
            return { success: false, message: 'Not in play phase' };
        }
        if (playerIndex !== this.currentPlayer) {
            return { success: false, message: 'Not your turn' };
        }

        const hand = this.hands[playerIndex];

        if (discardCardId) {
            const card = hand.find(c => c.id === discardCardId);
            if (card) {
                const idx = hand.indexOf(card);
                hand.splice(idx, 1);
                this.discard.push(card);
                this.addLog(`Player ${playerIndex + 1} yields and discards ${card.rank}${SUIT_SYMBOLS[card.suit]}`);
            }
        } else {
            this.addLog(`Player ${playerIndex + 1} yields their turn`);
        }

        // Enemy attacks
        const effectiveAttack = Math.max(0, this.currentEnemyAttack - this.shieldAmount);
        
        if (effectiveAttack > 0) {
            this.discardNeeded = effectiveAttack;
            this.discardedSoFar = [];
            this.phase = 'discard';
            this.addLog(`⚡ Enemy attacks for ${effectiveAttack}!`);

            if (this.hands[this.currentPlayer].length === 0) {
                const anyoneHasCards = this.hands.some(h => h.length > 0);
                if (!anyoneHasCards && this.tavern.length === 0) {
                    this.phase = 'gameover';
                    this.addLog('💀 Game Over!');
                    return { success: true, gameover: true };
                }
            }

            return { success: true, phase: 'discard', attackDamage: effectiveAttack };
        } else {
            this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
            return { success: true, phase: 'play' };
        }
    }

    /**
     * Get the current game state for rendering.
     */
    getState() {
        const effectiveAttack = this.currentEnemy 
            ? Math.max(0, this.currentEnemyAttack - this.shieldAmount) 
            : 0;
        
        return {
            phase: this.phase,
            currentPlayer: this.currentPlayer,
            hands: this.hands.map(h => [...h]),
            currentEnemy: this.currentEnemy ? { ...this.currentEnemy } : null,
            currentEnemyHP: this.currentEnemyHP,
            currentEnemyMaxHP: this.currentEnemyMaxHP,
            currentEnemyAttack: this.currentEnemyAttack,
            effectiveAttack,
            shieldAmount: this.shieldAmount,
            tavernCount: this.tavern.length,
            castleCount: this.castle.length,
            discardCount: this.discard.length,
            discardNeeded: this.discardNeeded,
            discardedSoFar: [...this.discardedSoFar],
            enemiesDefeated: this.enemiesDefeated,
            totalEnemies: 12,
            log: [...this.log],
            playerCount: this.playerCount
        };
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.RegicideGame = RegicideGame;
    window.cardValue = cardValue;
    window.SUIT_SYMBOLS = SUIT_SYMBOLS;
    window.SUIT_COLORS = SUIT_COLORS;
    window.isValidCombo = isValidCombo;
    window.comboValue = comboValue;
    window.comboSuits = comboSuits;
}
