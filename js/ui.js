/**
 * Regicide - UI Controller
 * 
 * Handles all rendering and user interaction for the Regicide game.
 */

class RegicideUI {
    constructor() {
        this.game = null;
        this.ai = null;
        this.selectedCards = new Set();
        this.animating = false;
        this.showingMenu = true;
        this.eventQueue = [];
    }

    init() {
        this.bindMenuEvents();
    }

    bindMenuEvents() {
        const startSoloBtn = document.getElementById('start-solo');
        const startBtn = document.getElementById('start-game');
        const rulesBtn = document.getElementById('show-rules');
        const closeRulesBtn = document.getElementById('close-rules');

        if (startSoloBtn) startSoloBtn.addEventListener('click', () => this.startGame(1));
        if (startBtn) startBtn.addEventListener('click', () => this.startGame(2));
        if (rulesBtn) rulesBtn.addEventListener('click', () => this.showRules());
        if (closeRulesBtn) closeRulesBtn.addEventListener('click', () => this.hideRules());
    }

    showRules() {
        document.getElementById('rules-modal').classList.add('active');
    }

    hideRules() {
        document.getElementById('rules-modal').classList.remove('active');
    }

    startGame(playerCount = 2) {
        this.game = new RegicideGame(playerCount);
        this.playerCount = playerCount;
        
        // Only create AI for 2-player mode
        if (playerCount === 2) {
            this.ai = new RegicideAI(this.game, 1); // AI is player 2
        } else {
            this.ai = null;
        }
        
        this.selectedCards.clear();

        document.getElementById('main-menu').classList.add('hidden');
        const gameBoard = document.getElementById('game-board');
        gameBoard.classList.remove('hidden');
        
        // Add solo-mode class to game board if solo
        if (playerCount === 1) {
            gameBoard.classList.add('solo-mode');
        } else {
            gameBoard.classList.remove('solo-mode');
        }

        this.bindGameEvents();
        this.render();
    }

    bindGameEvents() {
        const playBtn = document.getElementById('play-btn');
        const yieldBtn = document.getElementById('yield-btn');
        const newGameBtn = document.getElementById('new-game-btn');
        const menuBtn = document.getElementById('menu-btn');

        playBtn.addEventListener('click', () => this.handlePlay());
        yieldBtn.addEventListener('click', () => this.handleYield());
        newGameBtn.addEventListener('click', () => this.startGame(this.playerCount || 2));
        menuBtn.addEventListener('click', () => this.returnToMenu());
    }

    returnToMenu() {
        document.getElementById('main-menu').classList.remove('hidden');
        document.getElementById('game-board').classList.add('hidden');
        document.getElementById('game-over-overlay').classList.remove('active');
    }

    handlePlay() {
        if (this.animating) return;
        const state = this.game.getState();

        if (state.phase === 'play') {
            if (this.selectedCards.size === 0) {
                this.showMessage('Select cards to play!');
                return;
            }
            const cardIds = [...this.selectedCards];
            const result = this.game.playCards(0, cardIds);
            
            if (!result.success) {
                this.showMessage(result.message);
                return;
            }

            this.selectedCards.clear();
            this.showEvents(result.events);
            this.render();
            this.checkGameState();

        } else if (state.phase === 'discard') {
            if (this.selectedCards.size === 0) {
                this.showMessage('Select cards to discard!');
                return;
            }
            const cardIds = [...this.selectedCards];
            const result = this.game.discardCards(0, cardIds);

            if (!result.success) {
                this.showMessage(result.message);
                return;
            }

            this.selectedCards.clear();
            this.render();
            
            if (result.survived) {
                this.showMessage('Attack survived!');
                // Only run AI if not in solo mode
                if (this.ai) {
                    this.checkAndRunAI();
                }
            } else if (result.gameover) {
                this.renderGameOver(false);
            }
        }
    }

    handleYield() {
        if (this.animating) return;
        const state = this.game.getState();
        
        if (state.phase !== 'play') return;
        if (state.currentPlayer !== 0) return;

        const hand = state.hands[0];
        if (hand.length === 0) {
            this.showMessage('No cards to yield with!');
            return;
        }

        // If a card is selected, yield with that card, otherwise yield the lowest
        let discardId = null;
        if (this.selectedCards.size === 1) {
            discardId = [...this.selectedCards][0];
        } else {
            const sorted = [...hand].sort((a, b) => cardValue(a) - cardValue(b));
            discardId = sorted[0].id;
        }

        this.selectedCards.clear();
        const result = this.game.yieldTurn(0, discardId);
        
        if (result.success) {
            this.render();
            if (result.gameover) {
                this.renderGameOver(false);
            } else if (result.phase === 'discard') {
                // Player needs to discard for enemy attack
                this.showMessage(`Enemy attacks! Discard cards worth ${result.attackDamage} total.`);
            } else {
                // Only run AI if not in solo mode
                if (this.ai) {
                    this.checkAndRunAI();
                }
            }
        }
    }

    checkGameState() {
        const state = this.game.getState();
        if (state.phase === 'gameover') {
            this.renderGameOver(false);
        } else if (state.phase === 'victory') {
            this.renderGameOver(true);
        } else if (state.phase === 'play' && state.currentPlayer === 1 && this.ai) {
            // Only run AI if it exists (not solo mode)
            this.checkAndRunAI();
        }
        // If discard phase and player 0, wait for player input
    }

    checkAndRunAI() {
        if (!this.ai) return; // Skip if no AI (solo mode)
        
        const state = this.game.getState();
        if (state.phase === 'gameover' || state.phase === 'victory') {
            if (state.phase === 'victory') this.renderGameOver(true);
            else this.renderGameOver(false);
            return;
        }
        if (state.currentPlayer === 1) {
            setTimeout(() => this.runAITurn(), 800);
        }
    }

    runAITurn() {
        const state = this.game.getState();

        if (state.phase === 'gameover' || state.phase === 'victory') {
            return;
        }

        if (state.currentPlayer !== 1) return;

        if (state.phase === 'play') {
            const decision = this.ai.decidePlay();
            
            if (decision.type === 'play') {
                const result = this.game.playCards(1, decision.cardIds);
                if (result.success) {
                    this.render();
                    this.showMessage('AI played cards');

                    if (result.defeated) {
                        setTimeout(() => this.checkAndRunAI(), 600);
                        return;
                    }

                    // Check if AI needs to discard
                    const newState = this.game.getState();
                    if (newState.phase === 'discard' && newState.currentPlayer === 1) {
                        setTimeout(() => this.runAIDiscard(), 600);
                    } else {
                        this.checkGameState();
                    }
                }
            } else {
                const result = this.game.yieldTurn(1, decision.cardId);
                if (result.success) {
                    this.render();
                    if (result.gameover) {
                        this.renderGameOver(false);
                    } else if (result.phase === 'discard') {
                        setTimeout(() => this.runAIDiscard(), 600);
                    } else {
                        this.checkGameState();
                    }
                }
            }
        } else if (state.phase === 'discard') {
            this.runAIDiscard();
        }
    }

    runAIDiscard() {
        const state = this.game.getState();
        if (state.currentPlayer !== 1 || state.phase !== 'discard') return;

        const discardIds = this.ai.decideDiscard();
        if (discardIds.length > 0) {
            const result = this.game.discardCards(1, discardIds);
            this.render();

            if (result.gameover) {
                this.renderGameOver(false);
            } else if (result.survived) {
                this.showMessage('AI survived the attack');
                // Now it should be player 0's turn
                this.checkGameState();
            } else {
                // AI needs to discard more
                setTimeout(() => this.runAIDiscard(), 500);
            }
        } else {
            // AI has no cards to discard
            this.game.phase = 'gameover';
            this.renderGameOver(false);
        }
    }

    showEvents(events) {
        if (!events || events.length === 0) return;
        const messages = events.map(e => e.message).join(' ');
        this.showMessage(messages);
    }

    showMessage(text) {
        const msgEl = document.getElementById('message-bar');
        if (msgEl) {
            msgEl.textContent = text;
            msgEl.classList.add('visible');
            clearTimeout(this.messageTimeout);
            this.messageTimeout = setTimeout(() => {
                msgEl.classList.remove('visible');
            }, 3000);
        }
    }

    render() {
        const state = this.game.getState();
        
        this.renderEnemy(state);
        this.renderPlayerHand(state);
        if (this.ai) {
            this.renderAIHand(state);
        }
        this.renderGameInfo(state);
        this.renderActions(state);
        this.renderLog(state);
    }

    renderEnemy(state) {
        const enemyArea = document.getElementById('enemy-area');
        if (!state.currentEnemy) {
            enemyArea.innerHTML = '<div class="enemy-empty">No enemy</div>';
            return;
        }

        const enemy = state.currentEnemy;
        const hpPercent = (state.currentEnemyHP / state.currentEnemyMaxHP) * 100;
        const isRed = enemy.suit === 'hearts' || enemy.suit === 'diamonds';
        const suitColor = isRed ? '#e74c3c' : '#c9a227';
        const rankName = enemy.rank === 'J' ? 'Jack' : enemy.rank === 'Q' ? 'Queen' : 'King';

        enemyArea.innerHTML = `
            <div class="enemy-card ${enemy.suit}" data-rank="${enemy.rank}">
                <div class="enemy-rank">${enemy.rank}</div>
                <div class="enemy-suit" style="color: ${suitColor}">${SUIT_SYMBOLS[enemy.suit]}</div>
                <div class="enemy-title">${rankName} of ${enemy.suit}</div>
            </div>
            <div class="enemy-stats">
                <div class="hp-bar-container">
                    <div class="hp-bar" style="width: ${Math.max(0, hpPercent)}%"></div>
                    <span class="hp-text">HP: ${Math.max(0, state.currentEnemyHP)} / ${state.currentEnemyMaxHP}</span>
                </div>
                <div class="enemy-attack-display">
                    <span class="attack-icon">⚔️</span>
                    <span>Attack: ${state.currentEnemyAttack}</span>
                    ${state.shieldAmount > 0 ? `<span class="shield-info">🛡️ -${state.shieldAmount}</span>` : ''}
                    <span class="effective-attack">(Effective: ${state.effectiveAttack})</span>
                </div>
            </div>
        `;
    }

    renderPlayerHand(state) {
        const handEl = document.getElementById('player-hand');
        const hand = state.hands[0] || [];
        
        if (hand.length === 0) {
            handEl.innerHTML = '<div class="hand-empty">No cards in hand</div>';
            return;
        }

        const isPlayerTurn = state.currentPlayer === 0;
        const isDiscardPhase = state.phase === 'discard';

        handEl.innerHTML = hand.map(card => {
            const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
            const selected = this.selectedCards.has(card.id);
            const clickable = isPlayerTurn && (state.phase === 'play' || state.phase === 'discard');
            
            return `
                <div class="card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${clickable ? 'clickable' : ''}"
                     data-card-id="${card.id}"
                     onclick="ui.toggleCard('${card.id}')">
                    <div class="card-corner top-left">
                        <div class="card-rank">${card.rank}</div>
                        <div class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</div>
                    </div>
                    <div class="card-center">${SUIT_SYMBOLS[card.suit]}</div>
                    <div class="card-corner bottom-right">
                        <div class="card-rank">${card.rank}</div>
                        <div class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderAIHand(state) {
        const handEl = document.getElementById('ai-hand');
        const hand = state.hands[1] || [];
        
        handEl.innerHTML = `<div class="ai-hand-label">AI Partner (${hand.length} cards)</div>`;
        handEl.innerHTML += '<div class="ai-cards">' + 
            hand.map(() => '<div class="card-back"></div>').join('') +
            '</div>';
    }

    renderGameInfo(state) {
        document.getElementById('tavern-count').textContent = state.tavernCount;
        document.getElementById('castle-count').textContent = state.castleCount;
        document.getElementById('discard-count').textContent = state.discardCount;
        document.getElementById('enemies-defeated').textContent = `${state.enemiesDefeated} / ${state.totalEnemies}`;

        const turnLabel = document.getElementById('turn-label');
        if (state.phase === 'gameover') {
            turnLabel.textContent = 'Game Over';
            turnLabel.className = 'turn-label gameover';
        } else if (state.phase === 'victory') {
            turnLabel.textContent = 'Victory!';
            turnLabel.className = 'turn-label victory';
        } else if (state.phase === 'discard') {
            const remaining = state.discardNeeded - state.discardedSoFar.reduce((s, c) => s + cardValue(c), 0);
            if (this.ai) {
                turnLabel.textContent = state.currentPlayer === 0 
                    ? `Discard cards (${remaining} damage needed)` 
                    : 'AI discarding...';
            } else {
                turnLabel.textContent = `Discard cards (${remaining} damage needed)`;
            }
            turnLabel.className = 'turn-label discard';
        } else {
            if (this.ai) {
                turnLabel.textContent = state.currentPlayer === 0 ? 'Your Turn' : "AI's Turn";
                turnLabel.className = `turn-label ${state.currentPlayer === 0 ? 'your-turn' : 'ai-turn'}`;
            } else {
                turnLabel.textContent = 'Your Turn';
                turnLabel.className = 'turn-label your-turn';
            }
        }
    }

    renderActions(state) {
        const playBtn = document.getElementById('play-btn');
        const yieldBtn = document.getElementById('yield-btn');

        if (state.currentPlayer === 0 && state.phase === 'play') {
            playBtn.disabled = false;
            playBtn.textContent = '⚔️ Play Cards';
            yieldBtn.disabled = false;
            yieldBtn.classList.remove('hidden');
        } else if (state.currentPlayer === 0 && state.phase === 'discard') {
            playBtn.disabled = false;
            playBtn.textContent = '🗑️ Discard';
            yieldBtn.disabled = true;
            yieldBtn.classList.add('hidden');
        } else {
            playBtn.disabled = true;
            playBtn.textContent = '⏳ Waiting...';
            yieldBtn.disabled = true;
        }
    }

    renderLog(state) {
        const logEl = document.getElementById('game-log');
        if (logEl) {
            const recentLogs = state.log.slice(-8);
            logEl.innerHTML = recentLogs.map(msg => `<div class="log-entry">${msg}</div>`).join('');
            logEl.scrollTop = logEl.scrollHeight;
        }
    }

    renderGameOver(victory) {
        const overlay = document.getElementById('game-over-overlay');
        const title = document.getElementById('game-over-title');
        const message = document.getElementById('game-over-message');
        const state = this.game.getState();

        if (victory) {
            title.textContent = '🎉 Victory!';
            title.className = 'victory-title';
            if (this.ai) {
                message.textContent = `You and your AI partner defeated all ${state.enemiesDefeated} enemies! The kingdom is saved!`;
            } else {
                message.textContent = `You defeated all ${state.enemiesDefeated} enemies! The kingdom is saved!`;
            }
        } else {
            title.textContent = '💀 Defeat';
            title.className = 'defeat-title';
            message.textContent = `You defeated ${state.enemiesDefeated} of ${state.totalEnemies} enemies. The kingdom falls...`;
        }

        overlay.classList.add('active');
        this.render();
    }

    toggleCard(cardId) {
        const state = this.game.getState();
        if (state.currentPlayer !== 0) return;
        if (state.phase !== 'play' && state.phase !== 'discard') return;

        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
        } else {
            this.selectedCards.add(cardId);
        }

        // Validate the current selection for play phase
        if (state.phase === 'play' && this.selectedCards.size > 1) {
            const hand = state.hands[0];
            const selected = [...this.selectedCards].map(id => hand.find(c => c.id === id)).filter(Boolean);
            if (!isValidCombo(selected)) {
                // Check if all cards are the same rank
                const allSameRank = selected.length > 0 && selected.every(c => c.rank === selected[0].rank);
                if (allSameRank) {
                    // Same rank but total exceeds 10
                    const total = selected.reduce((sum, c) => sum + cardValue(c), 0);
                    this.showMessage(`Same-rank combos can only total up to 10 (current: ${total})`);
                } else {
                    // Different ranks
                    this.showMessage('Cards must be the same rank to play together');
                }
            }
        }

        this.renderPlayerHand(state);
    }
}

// Global UI instance
let ui;
document.addEventListener('DOMContentLoaded', () => {
    ui = new RegicideUI();
    ui.init();
});
