(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const COLS = 14;
  const ROWS = 14;
  const CELL = 40;
  const BOARD_SIZE = COLS * CELL;
  const HUNGER_INTERVALS = { easy: 30_000, steady: 20_000, quick: 10_000 };
  const COLORS = {
    mint: { hex: '#47ad82', rgb: '71, 173, 130' },
    blue: { hex: '#568dc3', rgb: '86, 141, 195' },
    purple: { hex: '#8d75b5', rgb: '141, 117, 181' },
    orange: { hex: '#dc9152', rgb: '220, 145, 82' }
  };
  const SPEEDS = {
    easy: { moveMs: 62.5, traceMs: 62.5 },
    steady: { moveMs: 7.8125, traceMs: 7.8125 },
    quick: { moveMs: 3.90625, traceMs: 3.90625 }
  };
  const DIRS = {
    up: { x: 0, y: -1 }, right: { x: 1, y: 0 },
    down: { x: 0, y: 1 }, left: { x: -1, y: 0 }
  };
  const OPPOSITE = { up: 'down', right: 'left', down: 'up', left: 'right' };
  const SLOT_ORDER = [0, 2, 1, 3];
  const REVERSE_STEP_MS = 320;
  const BEST_TIME_KEY = 'queueSnakeBestSurvivalMs';

  function hungerDuration() {
    return HUNGER_INTERVALS[speedName] || 0;
  }

  const setupScreen = $('#setupScreen');
  const workspace = $('#workspace');
  const board = $('#snakeBoard');
  const rightStack = $('.right-stack');
  const codePanel = $('.code-panel');
  const memoryPanel = $('.memory-panel');
  const codeCollapseButton = $('#codeCollapseButton');
  const memoryCollapseButton = $('#memoryCollapseButton');
  const restorePanelsButton = $('#restorePanelsButton');
  const nodeCount = $('#nodeCount');
  const hungerRow = $('#hungerRow');
  const gameStatus = $('#gameStatus');
  const pauseButton = $('#pauseButton');
  const restartButton = $('#restartButton');
  const startButton = $('#startButton');
  const traceStepCount = $('#traceStepCount');
  const tracePreviousButton = $('#tracePreviousButton');
  const traceNextButton = $('#traceNextButton');
  const traceReverseButton = $('#traceReverseButton');
  const tracePauseButton = $('#tracePauseButton');
  const traceHelp = $('#traceHelp');
  const codeLines = $('#codeLines');
  const codeCaption = $('#codeCaption');
  const eventText = $('#eventText');
  const eventNote = $('#eventNote');
  const memoryEvent = $('#memoryEvent');
  const memoryState = $('#memoryState');
  const heapGrid = $('#heapGrid');
  const hungerSeconds = $('#hungerSeconds');
  const hungerProgress = $('#hungerProgress');
  const hungerTrack = $('#hungerTrack');
  const livesValue = $('#livesValue');
  const bestTimeValue = $('#bestTimeValue');
  const bestTimeNote = $('#bestTimeNote');

  let colorName = 'mint';
  let speedName = 'easy';
  let gameState = 'setup';
  let snake = null;
  let apple = null;
  let direction = 'right';
  let directionQueue = [];
  let score = 0;
  let bestTimeMs = 0;
  let elapsedMs = 0;
  let nextMoveAt = 0;
  let nextHungerAt = HUNGER_INTERVALS.easy;
  let lastFrame = null;
  let frameRequestPending = false;
  let lastHudAt = 0;
  let nextNodeId = 1;
  let memoryGhosts = [];
  let lastNewNodeId = null;
  let growthRemaining = 0;
  let livesRemaining = 6;
  let operationPopup = null;
  let gameOverAnimation = null;
  let endingCurrentId = null;
  let traceSequence = null;
  let activeCodeMode = 'setup';
  let codePresentation = { mode: 'setup', focus: [], skip: [], caption: '' };
  let visualSnapshot = null;
  let historyEntries = [];
  let historyCursor = -1;
  let pauseLiveEntry = null;
  let reversePlayback = false;
  let nextReverseStepAt = 0;
  let pausedFromState = 'playing';
  let pauseStartedAt = 0;
  let liveEventMessage = 'Add at the tail; on an ordinary move, remove only the head.';
  let liveEventHighlight = false;
  function queuePositionLabel(node, display) {
    if (!node) return 'null';
    const isHead = node.id === display.head?.id;
    const isTail = node.id === display.tail?.id;
    if (isHead && isTail) return 'H/T';
    if (isHead) return 'H';
    if (isTail) return 'T';
    const index = (display.nodes || []).findIndex((item) => item.id === node.id);
    if (index >= 0) return String(index);
    if ((display.looseNodes || []).some((item) => item.id === node.id)) return 'new';
    if ((display.ghosts || []).some((item) => item.node?.id === node.id)) return 'removed head';
    return 'node';
  }

  function sameCell(a, b) {
    return Boolean(a && b && a.x === b.x && a.y === b.y);
  }

  function wrap(value, limit) {
    return (value + limit) % limit;
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  function loadBestTime() {
    try {
      if (typeof localStorage === 'undefined') return 0;
      const stored = Number(localStorage.getItem(BEST_TIME_KEY));
      return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
    } catch (_) {
      return 0;
    }
  }

  function renderBestTime() {
    const hasRecord = bestTimeMs > 0;
    const value = hasRecord ? formatTime(bestTimeMs) : '—:—';
    bestTimeValue.textContent = value;
    bestTimeValue.setAttribute('aria-label', hasRecord ? `Best survival time ${value}` : 'No best survival time recorded');
    bestTimeNote.textContent = hasRecord
      ? 'Longest run · saved in this browser'
      : 'Play a run to set a time · saved in this browser';
  }

  function saveBestTimeIfNeeded(milliseconds) {
    const candidate = Math.max(0, Math.floor(milliseconds));
    if (candidate <= bestTimeMs) return;
    bestTimeMs = candidate;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(BEST_TIME_KEY, String(bestTimeMs));
    } catch (_) {
      // Keep the in-memory best time even when storage is unavailable.
    }
    renderBestTime();
  }

  function setColor(name) {
    colorName = COLORS[name] ? name : 'mint';
    const color = COLORS[colorName];
    document.documentElement.style.setProperty('--snake', color.hex);
    document.documentElement.style.setProperty('--snake-rgb', color.rgb);
    $$('.color-option').forEach((button) => {
      const selected = button.dataset.color === colorName;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    board.setAttribute('aria-label', 'Queue, the snake board. Each circle is a singly linked node; add at tail and remove from head.');
  }

  function setSpeed(name) {
    speedName = SPEEDS[name] ? name : 'easy';
    hungerRow.hidden = false;
    $$('.difficulty-option').forEach((button) => {
      const selected = button.dataset.difficulty === speedName;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function setStatus(state) {
    const label = { setup: 'Ready', playing: 'Playing', paused: 'Paused', ending: 'Clearing…', ended: 'Finished' }[state] || 'Ready';
    gameStatus.className = `game-status${state === 'playing' ? ' is-active' : ''}${state === 'paused' ? ' is-paused' : ''}${state === 'ended' ? ' is-ended' : ''}`;
    gameStatus.querySelector('span').textContent = label;
    pauseButton.disabled = state === 'setup' || state === 'ending' || state === 'ended';
    pauseButton.setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
    pauseButton.title = state === 'paused' ? 'Resume (space)' : 'Pause (space)';
    pauseButton.textContent = state === 'paused' ? '▶' : 'Ⅱ';
  }

  function updateRightStackLayout() {
    const codeCollapsed = codePanel.classList.contains('is-collapsed');
    const memoryCollapsed = memoryPanel.classList.contains('is-collapsed');
    const bothCollapsed = codeCollapsed && memoryCollapsed;
    rightStack.classList.toggle('code-collapsed', codeCollapsed);
    rightStack.classList.toggle('memory-collapsed', memoryCollapsed);
    rightStack.classList.toggle('both-collapsed', bothCollapsed);
    workspace.classList.toggle('some-panel-collapsed', codeCollapsed || memoryCollapsed);
    workspace.classList.toggle('all-panels-collapsed', bothCollapsed);
    restorePanelsButton.hidden = !bothCollapsed;
  }

  function setPanelCollapsed(which, collapsed) {
    const panel = which === 'code' ? codePanel : memoryPanel;
    const button = which === 'code' ? codeCollapseButton : memoryCollapseButton;
    const title = which === 'code' ? 'Code' : 'Memory';
    panel.classList.toggle('is-collapsed', collapsed);
    button.textContent = collapsed ? '+' : '−';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${title} panel`);
    button.title = `${collapsed ? 'Expand' : 'Collapse'} ${title} panel`;
    if (!collapsed && which === 'code') renderCode(codePresentation.mode, codePresentation);
    if (!collapsed && which === 'memory') renderMemory();
  }

  function togglePanel(which) {
    const panel = which === 'code' ? codePanel : memoryPanel;
    setPanelCollapsed(which, !panel.classList.contains('is-collapsed'));
    updateRightStackLayout();
    if (codePanel.classList.contains('is-collapsed') && memoryPanel.classList.contains('is-collapsed') && typeof restorePanelsButton.focus === 'function') {
      restorePanelsButton.focus();
    }
  }

  function restorePanels() {
    setPanelCollapsed('code', false);
    setPanelCollapsed('memory', false);
    updateRightStackLayout();
  }

  function displayEvent(message, highlight = false) {
    eventText.textContent = message;
    eventNote.classList.toggle('is-highlight', highlight);
  }

  function setEvent(message, highlight = false) {
    liveEventMessage = message;
    liveEventHighlight = highlight;
    displayEvent(message, highlight);
  }

  function availableSlot(list) {
    const used = new Set();
    for (let node = list.head; node; node = node.next) used.add(node.slot);
    const now = performance.now();
    for (const ghost of memoryGhosts) {
      if (ghost.expiresAt > now) used.add(ghost.node.slot);
    }
    for (const slot of SLOT_ORDER) if (!used.has(slot)) return slot;
    let slot = 4;
    while (used.has(slot)) slot += 1;
    return slot;
  }

  class Node {
    constructor(cell, slot, data) {
      this.id = nextNodeId++;
      this.data = data;
      this.cell = { x: cell.x, y: cell.y };
      this.next = null;
      this.slot = slot;
    }
  }

  class SnakeQueue {
    constructor() {
      this.head = null;
      this.tail = null;
      this.size = 0;
    }

    *nodes() {
      let current = this.head;
      while (current) {
        yield current;
        current = current.next;
      }
    }

    toArray() { return Array.from(this.nodes()); }

    nodeAt(cell) {
      for (const node of this.nodes()) if (sameCell(node.cell, cell)) return node;
      return null;
    }

    addLast(cell, data) {
      const node = new Node(cell, availableSlot(this), data);
      if (this.tail) this.tail.next = node;
      else this.head = node;
      this.tail = node;
      this.size += 1;
      return node;
    }

    removeFirst() {
      if (!this.head) return null;
      const removed = this.head;
      this.head = removed.next;
      if (!this.head) this.tail = null;
      removed.next = null;
      this.size -= 1;
      return removed;
    }
  }

  function clonePosition(position) {
    return position ? { x: position.x, y: position.y } : null;
  }

  function createVisualSnapshot(options = {}) {
    const active = Object.prototype.hasOwnProperty.call(options, 'nodes') ? options.nodes : snake.toArray();
    const loose = options.looseNodes || [];
    const ghostItems = options.ghosts || memoryGhosts;
    const sourceNodes = [...active, ...loose, ...ghostItems.map((item) => item.node)];
    const unique = Array.from(new Set(sourceNodes));
    const copies = new Map();
    unique.forEach((node) => copies.set(node, {
      id: node.id,
      data: node.data,
      cell: { x: node.cell.x, y: node.cell.y },
      slot: node.slot,
      next: null
    }));
    const nextOverrides = options.nextOverrides || new Map();
    unique.forEach((node) => {
      const nextNode = nextOverrides.has(node) ? nextOverrides.get(node) : node.next;
      copies.get(node).next = copies.get(nextNode) || null;
    });
    const headSource = Object.prototype.hasOwnProperty.call(options, 'head') ? options.head : snake.head;
    const tailSource = Object.prototype.hasOwnProperty.call(options, 'tail') ? options.tail : snake.tail;
    const appleSource = Object.prototype.hasOwnProperty.call(options, 'apple') ? options.apple : apple;
    const popupSource = Object.prototype.hasOwnProperty.call(options, 'operationPopup') ? options.operationPopup : operationPopup;
    return {
      nodes: active.map((node) => copies.get(node)),
      head: copies.get(headSource) || null,
      tail: copies.get(tailSource) || null,
      looseNodes: loose.map((node) => copies.get(node)),
      ghosts: ghostItems.map((item) => ({ ...item, node: copies.get(item.node) })),
      apple: clonePosition(appleSource),
      operationPopup: popupSource ? { ...popupSource, cell: clonePosition(popupSource.cell) } : null,
      crashRed: options.crashRed ?? (gameState === 'ending' && gameOverAnimation?.reason === 'self'),
      currentId: options.currentId ?? endingCurrentId ?? null,
      memoryText: options.memoryText || '',
      queueSize: options.queueSize ?? snake?.size ?? active.length,
      growthRemaining: options.growthRemaining ?? growthRemaining,
      score: options.score ?? score,
      elapsedMs: options.elapsedMs ?? elapsedMs,
      nextHungerAt: options.nextHungerAt ?? nextHungerAt,
      livesRemaining: options.livesRemaining ?? livesRemaining,
      lastNewNodeId: options.lastNewNodeId ?? lastNewNodeId
    };
  }

  function withSnapshot(snapshot, changes = {}) {
    return { ...snapshot, ...changes };
  }

  const QUEUE_METHODS = Object.freeze({
    enqueue: 'offer',
    dequeue: 'poll',
    clear: 'clearQueue'
  });
  const QUEUE_CALLS = Object.freeze({
    enqueue: `${QUEUE_METHODS.enqueue}(val)`,
    dequeue: `${QUEUE_METHODS.dequeue}()`,
    clear: `${QUEUE_METHODS.clear}()`
  });
  const JAVA_METHOD_PATTERN = new RegExp(`\\b(${[...Object.values(QUEUE_METHODS), 'hungerTick', 'resetHungerTimer', 'resetSnake', 'size', 'isEmpty'].join('|')})\\b(?=\\()`, 'g');

  const CODE = {
    setup: {
      lines: [
        'class LinkedQueue { // custom singly linked FIFO',
        '    Node<Integer> head = null;',
        '    Node<Integer> tail = null;',
        '    int size = 0;',
        '    // Add and Remove tabs show offer(int val) and poll()',
        '    int size() { return size; }',
        '    boolean isEmpty() { return size == 0; }',
        '}',
        '',
        'class SnakeGame {',
        '    LinkedQueue snake = new LinkedQueue(); // shared queue',
        '    int applesEaten = 0; // score, not node data',
        '    int growthRemaining = 0; // future offers kept without poll()',
        '    int livesRemaining = 6;',
        '    int hungerIntervalMs = 30000; // 30s / 20s / 10s by difficulty',
        '    long elapsedMs = 0; // run clock',
        '    long nextHungerAt = hungerIntervalMs; // next deadline',
        '',
        '    void resetSnake() {',
        '        snake.offer(0); // starting head data',
        '        snake.offer(1);',
        '        snake.offer(2); // starting tail data',
        '    }',
        '    void resetHungerTimer() {',
        '        nextHungerAt = elapsedMs + hungerIntervalMs;',
        '    }',
        '}'
      ],
      caption: 'LinkedQueue is a custom next-only FIFO with head, tail, and size. SnakeGame shares one instance named snake; it starts with data 0, 1, 2. The Add and Remove tabs explain ordinary offer-then-poll movement and the apple growth exceptions.'
    },
    link: {
      lines: [
        'int growthUnits = growthRemaining + appleGrowth;',
        'boolean willGrow = growthUnits > 0;',
        'int val = snake.size() - 1 + (willGrow ? 1 : 0); // zero-based tail index',
        `snake.${QUEUE_METHODS.enqueue}(val); // pass a value, not a Node`,
        '// In LinkedQueue:',
        'boolean offer(int val) {',
        '    Node<Integer> newNode = new Node<>(val); // data = val; next = null',
        '    if (head == null) head = newNode;',
        '    else tail.next = newNode; // link after old tail',
        '    tail = newNode;',
        '    size++;',
        '    return true;',
        '}',
        '',
        'class Node<E> { // next-only node used by LinkedQueue',
        '    E data;',
        '    Node<E> next = null;',
        '    Node(E data) { this.data = data; }',
        '}'
      ],
      caption: `Add calculates the zero-based tail value and calls ${QUEUE_CALLS.enqueue}. Ordinary movement then uses Remove to call ${QUEUE_CALLS.dequeue}; when an apple's growth is kept, skip that removal. Easy/Medium keep one offer; Fast keeps two total, the second on the next move. Apples also reset the hunger deadline; growthRemaining counts extra offers still owed.`
    },
    remove: {
      lines: [
        'Integer poll() { // LinkedQueue method',
        '    if (head == null) return null; // empty queue',
        '    Node<Integer> removed = head;',
        '    head = head.next; // advance the FIFO head',
        '    if (head == null) tail = null; // queue is now empty',
        '    removed.next = null; // detach the old head',
        '    size--;',
        '    return removed.data;',
        '}',
        '',
        'void hungerTick() { // when elapsedMs reaches nextHungerAt',
        '    livesRemaining--; // one life per hunger event',
        '    if (snake.size() > 1) { // keep the sole node',
        `        snake.${QUEUE_METHODS.dequeue}();`,
        '    }',
        `    if (livesRemaining == 0) ${QUEUE_METHODS.clear}();`,
        '}'
      ],
      caption: `An ordinary movement calls ${QUEUE_CALLS.dequeue} after Add, so the head leaves and size stays constant. Apple-growth moves skip it; hunger also uses it when more than one node remains. poll() returns null if the queue is empty.`
    },
    ending: {
      lines: [
        `void ${QUEUE_METHODS.clear}() { // game-over cleanup helper`,
        '    while (!snake.isEmpty()) { // continue while nodes remain',
        `        snake.${QUEUE_METHODS.dequeue}(); // remove one head node`,
        '    }',
        '}'
      ],
      caption: `${QUEUE_CALLS.clear} repeatedly calls ${QUEUE_CALLS.dequeue}; the animation shows each head removal until snake is empty.`
    }
  };

  const codeStep = (mode, line, label, caption, skip = [], snapshot = null, memoryText = '') => ({
    mode, focus: Array.isArray(line) ? line : [line], label, caption, skip,
    snapshot: snapshot ? withSnapshot(snapshot, { memoryText }) : null
  });

  function nodeIntroSteps(snapshot) {
    return [
      codeStep('setup', [0, 1, 2, 3, 10, 19, 20, 21], 'LinkedQueue · snake', 'LinkedQueue stores head, tail, and size; SnakeGame shares it as snake and starts with values 0, 1, 2.', [], snapshot, 'The same snake queue is used by Add, Remove, and Game over.'),
      codeStep('link', [2, 6, 14, 15, 16, 17], 'Create node', 'offer(int val) creates Node(val); data stores val and next starts null.', [], snapshot, 'The new node is not linked until tail.next is updated.'),
      codeStep('link', 8, 'Link at tail', 'Connect the old tail to newNode.', [7], snapshot, 'next points forward; the conceptual Node has no prev pointer.'),
      codeStep('link', [9, 10, 11], 'Finish offer', 'Update tail, size, and the success result.', [], snapshot, `${QUEUE_CALLS.enqueue} completes at the tail.`),
      codeStep('setup', [23, 24], 'Reset hunger timer', 'Set a deadline by adding the selected interval to elapsed run time.', [], snapshot, 'For example, at 12 seconds on Easy, the next deadline is 12 + 30 = 42 seconds.')
    ];
  }

  function addLastSteps(snapshots = {}) {
    return [
      codeStep('link', [0, 1, 2, 3, 6], 'Create node', 'Compute the zero-based tail value, call offer(int val), and create Node(val).', [], snapshots.created, 'A conceptual node exists but is not in the queue yet.'),
      codeStep('link', 8, 'Link at tail', 'Set tail.next = newNode when the queue is non-empty.', [7], snapshots.linked, 'The previous tail points to the new node; update tail and size next.'),
      codeStep('link', [9, 10, 11], 'Offer complete', 'Move tail, increase size, and report success.', [], snapshots.added, `${QUEUE_CALLS.enqueue} finished; the new node contains val and is now at tail.`)
    ];
  }

  function moveSteps(ateApple, snapshots = {}) {
    const steps = [...addLastSteps(snapshots)];
    if (ateApple) {
      const intervalSeconds = Math.round(hungerDuration() / 1000);
      const appleText = snapshots.appleGrowth === 2
        ? `Fast apple: one offer is kept now and one on the next move; no head is removed on either growth move. Hunger restarts at ${intervalSeconds}s.`
        : `Apple: keep this offer and skip poll(), so the snake grows by one node. Hunger restarts at ${intervalSeconds}s.`;
      steps.push(codeStep('link', [0, 1, 2, 3], 'Keep growth offer', appleText, [], snapshots.afterAdd, appleText));
    } else if (snapshots.usedPendingGrowth) {
      steps.push(codeStep('link', [0, 1, 2, 3], 'Keep Fast growth offer', 'Use the remaining Fast growth offer and skip poll() on this move.', [], snapshots.afterAdd, `The second retained offer is due; ${QUEUE_CALLS.dequeue} is skipped.`));
    } else {
      steps.push(codeStep('remove', [0, 1, 2, 3, 4, 5, 6, 7], 'Poll head', `No growth is due; ${QUEUE_CALLS.dequeue} removes the old head after Add.`, [], snapshots.finished, `${QUEUE_CALLS.dequeue} balances the ordinary offer, so queue size stays the same.`));
    }
    return steps;
  }

  function hungerSteps(afterLifeSnapshot, afterSnapshot, removed) {
    const lives = afterLifeSnapshot.livesRemaining;
    const steps = [
      codeStep('remove', 11, 'Lose a life', 'Every hunger event consumes exactly one life.', [], afterLifeSnapshot, `One life lost; ${lives} ${lives === 1 ? 'life' : 'lives'} remain.`)
    ];
    if (removed) {
      steps.push(codeStep('remove', [12, 13], 'Poll head', `More than one node remains, so ${QUEUE_CALLS.dequeue} removes exactly one head value.`, [15], afterSnapshot, `${QUEUE_CALLS.dequeue} removed the former head; the last node is never removed by hunger.`));
    } else {
      steps.push(codeStep('remove', 12, 'Keep sole node', 'The queue has one node, so do not call poll().', [13, 15], afterSnapshot, `The final node stays; the hunger event still used one life (${lives} remain).`));
    }
    return steps;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function highlightJava(line) {
    const commentAt = line.indexOf('//');
    let code = commentAt >= 0 ? line.slice(0, commentAt) : line;
    const comment = commentAt >= 0 ? line.slice(commentAt) : '';
    code = escapeHtml(code)
      .replace(/\b(import|class|void|if|else|while|return|new|int|long|boolean)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/\b(Node|Queue|LinkedList|LinkedQueue|SnakeGame|Integer|E)\b/g, '<span class="token-type">$1</span>')
      .replace(JAVA_METHOD_PATTERN, '<span class="token-method">$1</span>')
      .replace(/\b(null|true|false)\b/g, '<span class="token-null">$1</span>');
    return code + (comment ? `<span class="token-comment">${escapeHtml(comment)}</span>` : '');
  }

  function newNodeValueFromSnapshot(snapshot) {
    if (!snapshot || snapshot.lastNewNodeId == null) return undefined;
    const node = [...(snapshot.nodes || []), ...(snapshot.looseNodes || [])]
      .find((item) => item.id === snapshot.lastNewNodeId);
    return node ? node.data : undefined;
  }

  function currentCodeValue() {
    const traceSnapshot = traceSequence?.steps[traceSequence.index]?.snapshot;
    const snapshot = visualSnapshot || traceSnapshot || (snake ? createVisualSnapshot() : null);
    return newNodeValueFromSnapshot(snapshot);
  }

  function renderCode(mode, options = {}) {
    const resolvedMode = CODE[mode] ? mode : 'setup';
    const code = CODE[resolvedMode];
    activeCodeMode = resolvedMode;
    const focus = [...(options.focus || [])].slice(0, 1);
    const skip = [...(options.skip || [])];
    const caption = options.caption || code.caption;
    const codeValue = resolvedMode === 'link'
      ? (Number.isInteger(options.codeValue) ? options.codeValue : currentCodeValue())
      : undefined;
    codePresentation = { mode: resolvedMode, focus, skip, caption, codeValue };
    if (codePanel.classList.contains('is-collapsed')) return;
    $$('.code-tab').forEach((button) => {
      const selected = button.dataset.codeMode === resolvedMode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    const displayLines = code.lines.map((line, index) =>
      resolvedMode === 'link' && index === 2 && codeValue !== undefined
        ? line.replace('snake.size() - 1 + (willGrow ? 1 : 0)', String(codeValue))
        : line
    );
    codeLines.innerHTML = displayLines.map((line, index) => {
      const active = focus.includes(index) ? ' focus-line' : '';
      const skipped = skip.includes(index) ? ' skipped-line' : '';
      return `<div class="code-line${active}${skipped}"><span class="line-number">${index + 1}</span><span class="line-code">${line ? highlightJava(line) : '&nbsp;'}</span></div>`;
    }).join('');
    codeCaption.textContent = caption;
  }

  function reviewLimit() {
    return historyEntries.length + (pauseLiveEntry ? 1 : 0) - 1;
  }

  function updateReviewControls() {
    const paused = gameState === 'paused';
    const ended = gameState === 'ended';
    const reviewable = paused || ended;
    const limit = reviewLimit();
    const canMoveForward = reviewable && (historyCursor < limit ||
      (!pauseLiveEntry && historyCursor === limit && traceSequence && traceSequence.index < traceSequence.steps.length - 1));
    const canMoveBackward = reviewable && historyCursor > 0;
    const canStartReverse = historyCursor > 0 && !reversePlayback && gameState !== 'setup';
    tracePreviousButton.disabled = !canMoveBackward;
    traceNextButton.disabled = !canMoveForward;
    traceReverseButton.disabled = !canStartReverse;
    tracePauseButton.disabled = !reversePlayback;
    traceReverseButton.setAttribute('aria-pressed', String(reversePlayback));
    traceReverseButton.title = reversePlayback ? 'Reverse playback is running' : 'Play trace backward';
    if (reversePlayback) traceHelp.textContent = 'Playing backward · Pause stops; Previous/Next step frame by frame.';
    else if (gameState === 'ended') traceHelp.textContent = historyCursor <= 0
      ? 'Game over · Oldest recorded frame; Next steps forward.'
      : 'Game over · Reverse or Previous/Next to review the run.';
    else if (gameState === 'ending') traceHelp.textContent = 'Game over animation · Reverse to review from here.';
    else if (gameState === 'setup') traceHelp.textContent = 'Start a game to see the trace.';
    else if (!paused) traceHelp.textContent = 'Reverse auto-pauses and rewinds; Previous/Next step through frames.';
    else if (pausedFromState === 'ending') traceHelp.textContent = 'Game over paused · Reverse replays; Resume continues the clear.';
    else if (pausedFromState === 'ended') traceHelp.textContent = 'Game over review · Reverse rewinds; Resume returns to results.';
    else if (historyCursor <= 0) traceHelp.textContent = 'Oldest recorded frame · Next steps forward; Resume returns to live play.';
    else if (historyCursor < limit) traceHelp.textContent = 'Paused · Reverse replays backward; Previous/Next step through frames.';
    else if (traceSequence && traceSequence.index < traceSequence.steps.length - 1) traceHelp.textContent = 'Paused · Reverse rewinds; Previous/Next inspect frames.';
    else traceHelp.textContent = 'At latest frame · Reverse rewinds; Resume returns to live play.';
  }

  function recordTraceStep(step, index, total) {
    const snapshot = step.snapshot || createVisualSnapshot({ memoryText: 'Follow next from head toward tail, then null.' });
    const entry = {
      mode: step.mode,
      focus: Array.isArray(step.focus) ? step.focus.slice(0, 1) : [],
      skip: step.skip || [],
      caption: step.caption,
      label: step.label,
      stepCount: `${index + 1} / ${total} · ${step.label}`,
      snapshot,
      eventText: step.eventText || step.caption,
      eventHighlight: Boolean(step.eventHighlight)
    };
    if (historyCursor >= 0 && historyCursor < historyEntries.length - 1) {
      historyEntries = historyEntries.slice(0, historyCursor + 1);
    }
    historyEntries.push(entry);
    if (historyEntries.length > 1200) {
      historyEntries.shift();
      historyCursor = Math.max(-1, historyCursor - 1);
    }
    historyCursor = historyEntries.length - 1;
    pauseLiveEntry = null;
    visualSnapshot = snapshot;
    traceStepCount.textContent = entry.stepCount;
    renderCode(entry.mode, { focus: entry.focus, caption: entry.caption, skip: entry.skip });
    renderBoard();
    renderMemory();
    updateHud();
    updateReviewControls();
  }

  function showTraceStep() {
    if (!traceSequence) return;
    const step = traceSequence.steps[traceSequence.index];
    recordTraceStep(step, traceSequence.index, traceSequence.steps.length);
    traceSequence.nextAt = elapsedMs + SPEEDS[speedName].traceMs;
  }

  function showReviewEntry(index) {
    if (pauseLiveEntry && index === historyEntries.length) {
      const entry = pauseLiveEntry;
      visualSnapshot = entry.snapshot;
      traceStepCount.textContent = 'Current state';
      renderCode(entry.mode, { caption: entry.caption });
      displayEvent(entry.eventText, entry.eventHighlight);
      renderBoard();
      renderMemory();
      updateHud();
      updateReviewControls();
      return;
    }
    const entry = historyEntries[index];
    if (!entry) return;
    visualSnapshot = entry.snapshot;
    traceStepCount.textContent = entry.stepCount;
    displayEvent(entry.eventText, entry.eventHighlight);
    renderCode(entry.mode, { focus: entry.focus, caption: entry.caption, skip: entry.skip });
    renderBoard();
    renderMemory();
    updateHud();
    updateReviewControls();
  }

  function makePauseEntry() {
    const latest = historyEntries[historyEntries.length - 1];
    return {
      mode: latest ? latest.mode : activeCodeMode,
      caption: 'Current game state; no code step is running.',
      eventText: liveEventMessage,
      eventHighlight: liveEventHighlight,
      snapshot: createVisualSnapshot({ memoryText: 'Current linked-list state at pause.' })
    };
  }

  function showLiveView() {
    visualSnapshot = null;
    const currentStep = traceSequence ? traceSequence.steps[traceSequence.index] : null;
    const latest = historyEntries[historyEntries.length - 1];
    if (currentStep) {
      renderCode(currentStep.mode, { focus: currentStep.focus, caption: currentStep.caption, skip: currentStep.skip });
      traceStepCount.textContent = `${traceSequence.index + 1} / ${traceSequence.steps.length} · ${currentStep.label}`;
    } else if (latest) {
      renderCode(latest.mode, { focus: latest.focus, caption: latest.caption, skip: latest.skip });
      traceStepCount.textContent = 'Done';
    } else {
      renderCode('setup');
      traceStepCount.textContent = '';
    }
    displayEvent(liveEventMessage, liveEventHighlight);
    renderBoard();
    renderMemory();
    updateHud();
    updateReviewControls();
  }

  function beginTrace(steps) {
    if (!steps || !steps.length) return;
    // Split grouped source references into separate trace frames: exactly one line is highlighted per frame.
    const lineSteps = steps.flatMap((step) => {
      const focus = Array.isArray(step.focus)
        ? [...new Set(step.focus.filter(Number.isInteger))]
        : Number.isInteger(step.focus) ? [step.focus] : [];
      if (focus.length <= 1) return [{ ...step, focus }];
      return focus.map((line) => ({
        ...step,
        focus: [line],
        label: `${step.label} · line ${line + 1}`
      }));
    });
    pauseLiveEntry = null;
    traceSequence = { steps: lineSteps, index: 0, nextAt: 0 };
    showTraceStep();
  }

  function advanceTrace() {
    if (!traceSequence) return;
    if (traceSequence.index + 1 >= traceSequence.steps.length) {
      traceSequence = null;
      nextMoveAt = elapsedMs + SPEEDS[speedName].moveMs;
      if (gameState === 'playing') showLiveView();
      else updateReviewControls();
      return;
    }
    traceSequence.index += 1;
    showTraceStep();
  }

  function isReviewState() {
    return gameState === 'paused' || gameState === 'ended';
  }

  function nextReviewStep() {
    if (!isReviewState()) return;
    pauseReversePlayback();
    const limit = reviewLimit();
    if (historyCursor < limit) {
      historyCursor += 1;
      showReviewEntry(historyCursor);
      return;
    }
    if (gameState === 'paused' && !pauseLiveEntry && traceSequence && traceSequence.index < traceSequence.steps.length - 1) advanceTrace();
  }

  function stepReviewBackward() {
    if (!isReviewState() || historyCursor <= 0) return false;
    historyCursor -= 1;
    showReviewEntry(historyCursor);
    return true;
  }

  function previousReviewStep() {
    if (!isReviewState()) return;
    pauseReversePlayback();
    stepReviewBackward();
  }

  function playTraceBackward() {
    if (gameState === 'playing' || gameState === 'ending') enterReviewPause(gameState);
    if (!isReviewState() || historyCursor <= 0) return;
    reversePlayback = true;
    stepReviewBackward();
    nextReverseStepAt = performance.now() + REVERSE_STEP_MS;
    updateReviewControls();
    scheduleFrame();
  }

  function pauseReversePlayback() {
    if (!reversePlayback) return;
    reversePlayback = false;
    updateReviewControls();
  }

  function advanceReversePlayback(now) {
    if (!reversePlayback || !isReviewState() || now < nextReverseStepAt) return;
    if (!stepReviewBackward() || historyCursor <= 0) {
      pauseReversePlayback();
      return;
    }
    nextReverseStepAt = now + REVERSE_STEP_MS;
  }

  function reviewCode(mode) {
    if (gameState === 'paused') pauseReversePlayback();
    if (gameState === 'ending') {
      renderCode('ending', {
        focus: [gameOverAnimation?.phase === 'flash' ? 1 : 2],
        caption: 'The game-over loop is removing one head node per step.'
      });
      return;
    }
    if (gameState === 'paused') {
      renderCode(mode);
      traceStepCount.textContent = 'Code example';
      traceHelp.textContent = 'Previous/Next review frames; Reverse plays history backward.';
      return;
    }
    traceSequence = null;
    traceNextButton.disabled = true;
    traceStepCount.textContent = 'Review';
    visualSnapshot = null;
    renderCode(mode);
    if (gameState === 'playing') {
      nextMoveAt = elapsedMs + SPEEDS[speedName].moveMs;
      renderBoard();
      renderMemory();
      updateHud();
    }
    updateReviewControls();
  }

  function updateHud() {
    const historical = (gameState === 'paused' || gameState === 'ended') && visualSnapshot;
    const shownTime = historical ? visualSnapshot.elapsedMs : elapsedMs;
    const shownScore = historical ? visualSnapshot.score : score;
    const shownHungerAt = historical ? visualSnapshot.nextHungerAt : nextHungerAt;
    const shownLives = historical ? (visualSnapshot.livesRemaining ?? livesRemaining) : livesRemaining;
    $('#survivalTime').textContent = formatTime(shownTime);
    $('#scoreValue').textContent = String(shownScore);
    nodeCount.textContent = String(historical ? visualSnapshot.nodes.length : (snake ? snake.size : 0));
    livesValue.textContent = String(shownLives);
    const duration = hungerDuration();
    if (!duration) return;
    const countdownVisible = ['playing', 'paused', 'ending', 'ended'].includes(gameState);
    const remaining = countdownVisible ? Math.max(0, shownHungerAt - shownTime) : duration;
    const progress = Math.max(0, Math.min(1, 1 - remaining / duration));
    const percent = Math.round(progress * 100);
    hungerSeconds.textContent = String(Math.ceil(remaining / 1000));
    hungerProgress.style.transform = `scaleX(${progress})`;
    hungerTrack.setAttribute('aria-valuenow', String(percent));
    hungerTrack.setAttribute('aria-valuetext', `${percent} percent hungry; hunger in ${Math.ceil(remaining / 1000)} seconds.`);
  }

  function pushGhosts(nodes, kind, duration = 475) {
    if (!nodes || !nodes.length) return;
    const now = performance.now();
    nodes.forEach((node) => memoryGhosts.push({ node, kind, duration, expiresAt: now + duration, createdAt: now }));
  }

  function setOperationPopup(node, method, kind, label = method, duration = 1500, detail = '') {
    if (!node) return;
    operationPopup = {
      nodeId: node.id,
      cell: clonePosition(node.cell),
      kind,
      label,
      detail,
      expiresAt: performance.now() + duration
    };
    renderBoard();
  }

  function pruneGhosts(now) {
    const oldMemory = memoryGhosts.length;
    memoryGhosts = memoryGhosts.filter((item) => item.expiresAt > now);
    const popupExpired = operationPopup && operationPopup.expiresAt <= now;
    if (popupExpired) operationPopup = null;
    if (memoryGhosts.length !== oldMemory) renderMemory();
    if (memoryGhosts.length !== oldMemory || popupExpired) renderBoard();
  }

  function pointFor(cell) {
    return { x: (cell.x + .5) * CELL, y: (cell.y + .5) * CELL };
  }

  function svgLine(x1, y1, x2, y2, className = 'snake-link') {
    return `<line class="${className}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#listArrow)" />`;
  }

  function linkBetween(from, to, className = 'snake-link') {
    const a = pointFor(from.cell);
    const b = pointFor(to.cell);
    let dx = to.cell.x - from.cell.x;
    let dy = to.cell.y - from.cell.y;
    if (dx > COLS / 2) dx -= COLS;
    if (dx < -COLS / 2) dx += COLS;
    if (dy > ROWS / 2) dy -= ROWS;
    if (dy < -ROWS / 2) dy += ROWS;
    const radius = 12;
    if (Math.abs(to.cell.x - from.cell.x) > COLS / 2) {
      if (dx > 0) return svgLine(a.x + radius, a.y, BOARD_SIZE - 1, a.y, className) + svgLine(1, b.y, b.x - radius, b.y, className);
      return svgLine(a.x - radius, a.y, 1, a.y, className) + svgLine(BOARD_SIZE - 1, b.y, b.x + radius, b.y, className);
    }
    if (Math.abs(to.cell.y - from.cell.y) > ROWS / 2) {
      if (dy > 0) return svgLine(a.x, a.y + radius, a.x, BOARD_SIZE - 1, className) + svgLine(b.x, 1, b.x, b.y - radius, className);
      return svgLine(a.x, a.y - radius, a.x, 1, className) + svgLine(b.x, BOARD_SIZE - 1, b.x, b.y + radius, className);
    }
    return svgLine(a.x + Math.sign(dx) * radius, a.y + Math.sign(dy) * radius,
      a.x + dx * CELL - Math.sign(dx) * radius, a.y + dy * CELL - Math.sign(dy) * radius, className);
  }

  function renderBoard() {
    if (!snake) return;
    const display = visualSnapshot || createVisualSnapshot();
    const nodes = display.nodes;
    const looseNodes = display.looseNodes || [];
    const ghosts = display.ghosts || [];
    const activeIds = new Set(nodes.map((node) => node.id));
    const looseIds = new Set(looseNodes.map((node) => node.id));
    const color = COLORS[colorName];
    const crashRed = display.crashRed ?? (gameState === 'ending' && gameOverAnimation?.reason === 'self');
    const svg = [];
    svg.push(`<defs>
      <pattern id="boardDots" width="40" height="40" patternUnits="userSpaceOnUse"><circle class="svg-grid-dot" cx="20" cy="20" r="1.1" /></pattern>
      <marker id="listArrow" markerWidth="7" markerHeight="7" refX="5.7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 7 3.5 0 7Z" fill="${color.hex}" /></marker>
    </defs>`);
    svg.push('<rect width="560" height="560" rx="8" fill="#fbfcfa" /><rect width="560" height="560" rx="8" fill="url(#boardDots)" />');
    for (let i = 1; i < COLS; i += 1) {
      const p = i * CELL;
      svg.push(`<line class="svg-grid-line" x1="${p}" y1="0" x2="${p}" y2="560" /><line class="svg-grid-line" x1="0" y1="${p}" x2="560" y2="${p}" />`);
    }
    svg.push('<g>');
    nodes.forEach((node) => {
      if (!node.next) return;
      if (activeIds.has(node.next.id)) svg.push(linkBetween(node, node.next));
      else if (looseIds.has(node.next.id)) svg.push(linkBetween(node, node.next, 'snake-link-pending'));
    });
    looseNodes.forEach((node) => {
      if (node.next && (activeIds.has(node.next.id) || looseIds.has(node.next.id))) {
        svg.push(linkBetween(node, node.next, 'snake-link-pending'));
      }
    });
    svg.push('</g>');

    ghosts.forEach((ghost) => {
      if (!ghost.node) return;
      const point = pointFor(ghost.node.cell);
      const reviewClass = gameState === 'paused' ? ' ghost-node-review' : '';
      const crashClass = crashRed && ghost.kind === 'game-over' ? ' ghost-node-crashing' : '';
      svg.push(`<g class="ghost-node${reviewClass}${crashClass}" transform="translate(${point.x} ${point.y})" style="--ghost-duration:${ghost.duration ?? 350}ms" aria-hidden="true"><circle class="ghost-circle" r="11.5" /><path class="ghost-cross" d="M-3-3 3 3M3-3-3 3" /></g>`);
    });

    const renderNode = (node, loose = false) => {
      const point = pointFor(node.cell);
      const head = node.id === display.head?.id;
      const tail = node.id === display.tail?.id;
      const bothEnds = head && tail;
      const fresh = node.id === display.lastNewNodeId;
      const current = node.id === display.currentId;
      const index = nodes.findIndex((item) => item.id === node.id);
      const mark = bothEnds ? 'H/T' : head ? 'H' : tail ? 'T' : index >= 0 ? String(index) : '+';
      const positionName = queuePositionLabel(node, display);
      const nextName = node.next ? queuePositionLabel(node.next, display) : 'null';
      const linkedFromQueue = loose && nodes.some((activeNode) => activeNode.next?.id === node.id);
      const nodeState = loose ? (linkedFromQueue ? ' (new node linked; tail update pending)' : ' (new, not linked yet)') : '';
      const classes = ['snake-node'];
      if (head) classes.push('snake-node-head');
      if (tail) classes.push('snake-node-tail');
      if (fresh) classes.push('snake-node-new');
      if (current) classes.push('snake-node-current');
      if (loose) classes.push('snake-node-loose');
      if (bothEnds) classes.push('snake-node-index-both');
      if (crashRed) classes.push('snake-node-crashing');
      svg.push(`<g class="${classes.join(' ')}" transform="translate(${point.x} ${point.y})" style="--snake:${color.hex};--snake-rgb:${color.rgb}">
        <circle class="snake-node-halo" r="14.5" /><circle class="snake-node-circle" r="11.5" /><circle class="snake-node-core" r="5.5" />
        <text class="snake-node-index" y=".5">${mark}</text>
        <title>${positionName}${nodeState}; data ${node.data}; next ${nextName}</title>
      </g>`);
    };
    nodes.forEach((node) => renderNode(node));
    looseNodes.forEach((node) => renderNode(node, true));

    if (display.apple) {
      const p = pointFor(display.apple);
      const fastApple = speedName === 'quick';
      const appleMark = fastApple ? '<text class="apple-mark" x="0" y="2">2</text>' : '';
      const appleLabel = fastApple ? 'Apple: adds two queue nodes in Fast mode.' : 'Apple: adds one queue node.';
      svg.push(`<g class="apple-icon" transform="translate(${p.x} ${p.y})"><title>${appleLabel}</title><circle class="apple-shadow" r="14" /><circle class="apple-body" cy="2" r="8" /><path class="apple-stem" d="M0-5q-.5-3 1-4" /><path class="apple-leaf" d="M1-7q4-2 5 0-2 2-5 0Z" /><ellipse class="apple-shine" cx="-3" cy="0" rx="1.4" />${appleMark}</g>`);
    }

    const popup = display.operationPopup;
    if (popup && (gameState === 'paused' || gameState === 'ended' || popup.expiresAt > performance.now())) {
      const popupNode = [...nodes, ...looseNodes, ...ghosts.map((item) => item.node)].find((node) => node.id === popup.nodeId);
      const anchor = pointFor(popupNode?.cell || popup.cell);
      const width = Math.max(72, popup.label.length * 7.2 + 20);
      const left = Math.max(4, Math.min(BOARD_SIZE - width - 4, anchor.x - width / 2));
      const above = anchor.y >= 50;
      const top = above ? anchor.y - 36 : Math.min(BOARD_SIZE - 26, anchor.y + 14);
      const pointerX = anchor.x - left;
      const pointerPath = above
        ? `M${pointerX - 5} 22 L${pointerX} 28 L${pointerX + 5} 22 Z`
        : `M${pointerX - 5} 0 L${pointerX} -6 L${pointerX + 5} 0 Z`;
      const popupClass = popup.kind === 'remove' ? 'operation-popup operation-popup-remove' : 'operation-popup operation-popup-add';
      svg.push(`<g class="${popupClass}" transform="translate(${left} ${top})" aria-hidden="true"><title>${escapeHtml(popup.detail || popup.label)}</title><rect class="operation-popup-bg" width="${width}" height="22" rx="6" /><path class="operation-popup-pointer" d="${pointerPath}" /><text class="operation-popup-text" x="${width / 2}" y="15">${escapeHtml(popup.label)}</text></g>`);
    }
    board.innerHTML = svg.join('');
    board.style.setProperty('--snake', color.hex);
    board.style.setProperty('--snake-rgb', color.rgb);
  }

  function renderMemory() {
    if (!snake || memoryPanel.classList.contains('is-collapsed')) return;
    const display = visualSnapshot || createVisualSnapshot();
    const active = display.nodes;
    memoryState.textContent = `size: ${display.queueSize ?? active.length} · growthRemaining: ${display.growthRemaining ?? 0} · lives: ${display.livesRemaining ?? livesRemaining}`;
    const occupied = new Map();
    active.forEach((node) => occupied.set(node.slot, { node, kind: 'active' }));
    (display.looseNodes || []).forEach((node) => {
      if (!occupied.has(node.slot)) occupied.set(node.slot, { node, kind: 'loose' });
    });
    (display.ghosts || []).forEach((item) => {
      if (item.node && !occupied.has(item.node.slot)) occupied.set(item.node.slot, { node: item.node, kind: 'detached', ghost: item });
    });
    const largest = occupied.size ? Math.max(...occupied.keys()) : 0;
    const slotCount = Math.max(4, Math.ceil((largest + 1) / 2) * 2);
    const cards = [];
    for (let slot = 0; slot < slotCount; slot += 1) {
      const item = occupied.get(slot);
      if (!item) {
        cards.push('<div class="heap-slot free"><span class="slot-free-label">empty</span></div>');
        continue;
      }
      const { node, kind, ghost } = item;
      const head = kind === 'active' && node.id === display.head?.id;
      const tail = kind === 'active' && node.id === display.tail?.id;
      const current = node.id === display.currentId;
      const crashing = display.crashRed ?? (gameState === 'ending' && gameOverAnimation?.reason === 'self');
      const positionName = queuePositionLabel(node, display);
      const linkedFromActive = kind === 'loose' && active.some((activeNode) => activeNode.next?.id === node.id);
      const status = current ? 'current' : kind === 'loose' ? (linkedFromActive ? 'linked; tail next' : 'unlinked') : kind === 'detached' ? 'removed' : '';
      const statusBadge = status ? `<span class="slot-tag">${status}</span>` : '';
      const classes = ['heap-slot'];
      if (head) classes.push('is-head');
      if (tail) classes.push('is-tail');
      if (kind === 'detached') classes.push('is-detached');
      if (kind === 'loose') classes.push('is-loose');
      if (linkedFromActive) classes.push('is-linking');
      if (current) classes.push('is-current');
      if (crashing && kind === 'active') classes.push('is-crashing');
      if (kind === 'active' && node.id === display.lastNewNodeId) classes.push('is-new');
      if (ghost?.kind === 'game-over') classes.push('is-clearing');
      const next = node.next ? `→ ${queuePositionLabel(node.next, display)}` : 'null';
      const ariaLabel = `${positionName}${current ? ', current' : ''}${status ? `, ${status}` : ''}, data ${node.data}, next ${next}`;
      cards.push(`<div class="${classes.join(' ')}" aria-label="${escapeHtml(ariaLabel)}">
        <div class="slot-top"><span class="slot-address">${escapeHtml(positionName)}</span>${statusBadge}</div>
        <div class="slot-value">data <b>${node.data}</b></div>
        <div class="slot-next">next <b>${escapeHtml(next)}</b></div>
      </div>`);
    }
    heapGrid.innerHTML = cards.join('');

    if (display.memoryText) memoryEvent.textContent = display.memoryText;
    else if ((display.ghosts || []).some((item) => item.kind === 'game-over')) memoryEvent.textContent = `${QUEUE_CALLS.clear} uses ${QUEUE_CALLS.dequeue} to empty the queue.`;
    else if ((display.ghosts || []).some((item) => item.kind === 'hunger')) memoryEvent.textContent = `Hunger: ${QUEUE_CALLS.dequeue} removed the head node.`;
    else if ((display.ghosts || []).some((item) => item.kind === 'slide')) memoryEvent.textContent = `${QUEUE_CALLS.enqueue} added at tail; ${QUEUE_CALLS.dequeue} removed at head.`;
    else memoryEvent.textContent = 'Follow next to trace the queue from head to tail.';
  }

  function chooseEmptyCell() {
    const occupied = new Set(snake.toArray().map((node) => `${node.cell.x},${node.cell.y}`));
    const open = [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) if (!occupied.has(`${x},${y}`)) open.push({ x, y });
    }
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
  }

  function resetData() {
    gameOverAnimation = null;
    endingCurrentId = null;
    memoryGhosts = [];
    nextNodeId = 1;
    score = 0;
    elapsedMs = 0;
    snake = new SnakeQueue();
    snake.addLast({ x: 3, y: 7 }, 0);
    snake.addLast({ x: 4, y: 7 }, 1);
    snake.addLast({ x: 5, y: 7 }, 2);
    apple = chooseEmptyCell();
    direction = 'right';
    directionQueue = [];
    lastNewNodeId = null;
    growthRemaining = 0;
    livesRemaining = 6;
    operationPopup = null;
  }

  function startRun() {
    gameOverAnimation = null;
    endingCurrentId = null;
    resetData();
    gameState = 'playing';
    nextMoveAt = Infinity;
    nextHungerAt = hungerDuration() ? hungerDuration() : Infinity;
    lastFrame = null;
    traceSequence = null;
    reversePlayback = false;
    pausedFromState = 'playing';
    pauseStartedAt = 0;
    visualSnapshot = null;
    historyEntries = [];
    historyCursor = -1;
    pauseLiveEntry = null;
    setupScreen.hidden = true;
    workspace.hidden = false;
    setStatus('playing');
    setEvent('Add at the tail; on an ordinary move, remove only the head.', false);
    traceStepCount.textContent = '';
    renderBoard();
    renderMemory();
    updateHud();
    updateReviewControls();
    beginTrace(nodeIntroSteps(createVisualSnapshot()));
    scheduleFrame();
  }

  function showSetup() {
    gameOverAnimation = null;
    endingCurrentId = null;
    gameState = 'setup';
    lastFrame = null;
    traceSequence = null;
    reversePlayback = false;
    pausedFromState = 'playing';
    pauseStartedAt = 0;
    visualSnapshot = null;
    pauseLiveEntry = null;
    setupScreen.hidden = false;
    workspace.hidden = true;
    setStatus('setup');
    updateReviewControls();
  }

  function endRun(reason) {
    if (gameState !== 'playing') return;
    saveBestTimeIfNeeded(elapsedMs);
    gameState = 'ending';
    lastFrame = null;
    traceSequence = null;
    reversePlayback = false;
    visualSnapshot = null;
    pauseLiveEntry = null;
    endingCurrentId = null;

    const messages = {
      self: 'The moving snake tip at queue tail hit its own body.',
      full: 'The queue filled every cell; no room remains.',
      hunger: 'All six lives were used by hunger.'
    };
    const notice = `Game over. ${messages[reason] || 'The game has ended.'} Apples: ${score}.`;
    const removeInterval = Math.max(35, Math.min(140, 6500 / Math.max(1, snake.size)));
    gameOverAnimation = {
      reason,
      notice,
      phase: reason === 'self' ? 'flash' : 'remove',
      nextAt: performance.now() + (reason === 'self' ? 520 : 160),
      removeInterval,
      removed: 0,
      total: snake.size
    };
    apple = null;
    const gameOverMessage = reason === 'self'
      ? `Self-impact: the body turns red, then ${QUEUE_CALLS.clear} calls ${QUEUE_CALLS.dequeue} from head to tail.`
      : reason === 'hunger'
        ? `Hunger used all six lives; ${QUEUE_CALLS.clear} clears the queue without the red self-impact phase.`
        : `Game over: ${QUEUE_CALLS.clear} removes one queue-head node at a time with ${QUEUE_CALLS.dequeue}.`;
    setEvent(gameOverMessage, true);
    setStatus('ending');
    const impactCaption = reason === 'self'
      ? `Self-impact turns the body red before ${QUEUE_CALLS.clear} calls ${QUEUE_CALLS.dequeue} from head to tail.`
      : reason === 'hunger'
        ? `All six hunger lives are gone; normal game over runs ${QUEUE_CALLS.clear} from head toward tail.`
        : `The board is full; ${QUEUE_CALLS.clear} calls ${QUEUE_CALLS.dequeue} from head toward tail.`;
    recordTraceStep({
      mode: 'ending', focus: [1], skip: [], caption: impactCaption,
      label: 'Game-over start', eventText: impactCaption, eventHighlight: true,
      snapshot: createVisualSnapshot({ memoryText: impactCaption })
    }, 0, 1);
    visualSnapshot = null;
    traceStepCount.textContent = `Head removals · 0 / ${snake.size}`;
  }

  function finishEndRun() {
    if (!gameOverAnimation) return;
    const notice = gameOverAnimation.notice;
    operationPopup = null;
    gameState = 'ended';
    gameOverAnimation = null;
    endingCurrentId = null;
    pausedFromState = 'ended';
    visualSnapshot = null;
    setEvent(notice, true);
    setStatus('ended');
    const finishedCaption = `${QUEUE_CALLS.clear} finished; snake.isEmpty() is true.`;
    recordTraceStep({
      mode: 'ending', focus: [], skip: [], caption: finishedCaption,
      label: 'Game over', eventText: notice, eventHighlight: true,
      snapshot: createVisualSnapshot({ memoryText: finishedCaption })
    }, 0, 1);
    traceStepCount.textContent = 'Game over';
  }

  function advanceGameOverAnimation(now) {
    if (!gameOverAnimation || gameState !== 'ending') return;
    pruneGhosts(now);
    if (now < gameOverAnimation.nextAt) {
      if (now - lastHudAt > 120) { updateHud(); lastHudAt = now; }
      return;
    }
    if (gameOverAnimation.phase === 'flash') gameOverAnimation.phase = 'remove';
    if (gameOverAnimation.phase === 'finish') {
      finishEndRun();
      return;
    }
    if (!snake.head) {
      finishEndRun();
      return;
    }

    const removed = snake.removeFirst();
    if (!removed) {
      finishEndRun();
      return;
    }
    endingCurrentId = removed.id;
    const ghostDuration = Math.max(80, gameOverAnimation.removeInterval / 2);
    pushGhosts([removed], 'game-over', ghostDuration);
    visualSnapshot = null;
    setOperationPopup(removed, QUEUE_METHODS.dequeue, 'remove', QUEUE_CALLS.dequeue, Math.max(350, gameOverAnimation.removeInterval * 2));
    gameOverAnimation.removed += 1;
    const removalCaption = `${QUEUE_CALLS.clear} calls ${QUEUE_CALLS.dequeue} once per node until the queue is empty.`;
    setEvent(`${QUEUE_CALLS.clear} is removing head node ${gameOverAnimation.removed} of ${gameOverAnimation.total} with ${QUEUE_CALLS.dequeue}; the next head is closer to tail.`, true);
    recordTraceStep({
      mode: 'ending', focus: [2], skip: [], caption: removalCaption,
      label: `Remove head node ${gameOverAnimation.removed}`,
      eventText: liveEventMessage, eventHighlight: true,
      snapshot: createVisualSnapshot({ memoryText: removalCaption })
    }, gameOverAnimation.removed - 1, gameOverAnimation.total);
    visualSnapshot = null;
    traceStepCount.textContent = `Head removals · ${gameOverAnimation.removed} / ${gameOverAnimation.total}`;

    if (!snake.head) {
      gameOverAnimation.phase = 'finish';
      gameOverAnimation.nextAt = now + Math.max(160, gameOverAnimation.removeInterval);
    } else {
      gameOverAnimation.phase = 'remove';
      gameOverAnimation.nextAt = now + gameOverAnimation.removeInterval;
    }
  }

  function beginSnakeMove() {
    if (gameState !== 'playing' || !snake.tail) return;
    operationPopup = null; // clear event popups before the next movement
    if (directionQueue.length) direction = directionQueue.shift();
    const delta = DIRS[direction];
    const nextCell = { x: wrap(snake.tail.cell.x + delta.x, COLS), y: wrap(snake.tail.cell.y + delta.y, ROWS) };
    const ateApple = sameCell(nextCell, apple);
    const appleGrowth = ateApple ? (speedName === 'quick' ? 2 : 1) : 0;
    const existing = snake.nodeAt(nextCell);
    const willRemoveHead = growthRemaining + appleGrowth === 0;
    const headMovesAway = existing && existing === snake.head && willRemoveHead;
    if (existing && !headMovesAway) {
      operationPopup = null;
      setEvent('The moving snake tip at queue tail hit its own body; game over.', true);
      renderCode('ending', { caption: 'A queue node cannot move onto a body cell that stays linked.' });
      endRun('self');
      return;
    }

    const beforeNodes = snake.toArray();
    const oldHead = snake.head;
    const oldTail = snake.tail;
    const oldGhosts = memoryGhosts.slice();
    const growthPendingBefore = growthRemaining;
    const growthUnits = growthRemaining + appleGrowth;
    const grewWithoutDequeue = growthUnits > 0;
    const sizeBeforeOffer = snake.size;
    const offeredValue = sizeBeforeOffer - 1 + (grewWithoutDequeue ? 1 : 0);
    const offerLabel = `offer(${offeredValue})`;
    const fastGrowthNote = appleGrowth === 2
      ? ' Fast apple leaves one more growth node for the next move.'
      : growthPendingBefore > 0 ? ' This uses the remaining Fast growth node.' : '';
    const offerDetail = `Growth keeps this node: current size ${sizeBeforeOffer} is the new tail's zero-based index, so val = ${offeredValue}. An ordinary move uses val = size - 1, then poll() removes the head so size does not grow.${fastGrowthNote}`;
    growthRemaining = grewWithoutDequeue ? growthUnits - 1 : 0;
    const newTail = snake.addLast(nextCell, offeredValue);
    lastNewNodeId = newTail.id;

    if (ateApple) {
      score += 1;
      nextHungerAt = elapsedMs + hungerDuration();
      apple = chooseEmptyCell();
      const growthText = appleGrowth === 2
        ? `Fast apple: ${QUEUE_CALLS.enqueue} adds one tail node; one more growth offer is due next move. Hunger resets to 0% for ${Math.round(hungerDuration() / 1000)}s.`
        : `Apple eaten: ${QUEUE_CALLS.enqueue} adds one tail node; hunger resets to 0% for ${Math.round(hungerDuration() / 1000)}s.`;
      setEvent(growthText, true);
      setOperationPopup(newTail, QUEUE_METHODS.enqueue, 'add', offerLabel, 1500, offerDetail);
    } else if (growthPendingBefore > 0) {
      setEvent(`Fast-apple growth: ${QUEUE_CALLS.enqueue} enqueued the next node at tail; the head stays.`, true);
      setOperationPopup(newTail, QUEUE_METHODS.enqueue, 'add', offerLabel, 1500, offerDetail);
    } else {
      setEvent('Added at tail; removed only the head. Queue size stayed the same.', true);
    }

    const created = createVisualSnapshot({
      nodes: beforeNodes, looseNodes: [newTail], head: oldHead, tail: oldTail,
      apple, score, ghosts: oldGhosts, queueSize: beforeNodes.length, growthRemaining: growthPendingBefore,
      nextOverrides: new Map([[oldTail, null]]),
      lastNewNodeId: newTail.id
    });
    const linked = createVisualSnapshot({
      nodes: beforeNodes, looseNodes: [newTail], head: oldHead, tail: oldTail,
      apple, score, ghosts: oldGhosts, queueSize: beforeNodes.length, growthRemaining: growthPendingBefore,
      nextOverrides: new Map([[oldTail, newTail]]),
      lastNewNodeId: newTail.id
    });
    const added = createVisualSnapshot({
      nodes: snake.toArray(), head: oldHead, tail: newTail,
      apple, score, ghosts: oldGhosts, queueSize: snake.size, growthRemaining: growthPendingBefore,
      lastNewNodeId: newTail.id
    });
    const scheduled = withSnapshot(added, { growthRemaining: growthUnits });

    if (!grewWithoutDequeue) {
      const removed = snake.removeFirst();
      if (removed) pushGhosts([removed], 'slide', 375);
    }
    const finished = createVisualSnapshot({
      nodes: snake.toArray(), head: snake.head, tail: snake.tail,
      apple, score, ghosts: memoryGhosts.slice(), lastNewNodeId: newTail.id
    });
    const steps = moveSteps(ateApple, {
      created, linked, added, scheduled, afterAdd: finished, finished,
      appleGrowth, usedPendingGrowth: growthPendingBefore > 0
    });

    if (!apple) {
      renderCode('ending', { caption: 'Every cell is occupied: the snake queue fills the board.' });
      endRun('full');
      return;
    }
    nextMoveAt = Infinity;
    beginTrace(steps);
  }

  function hungerTick() {
    if (gameState !== 'playing' || !snake.head) return;
    const nodes = snake.toArray();
    const oldHead = snake.head;
    operationPopup = null; // show this hunger event's removal, not a stale popup
    livesRemaining = Math.max(0, livesRemaining - 1);
    if (snake.size > 1) setOperationPopup(oldHead, QUEUE_METHODS.dequeue, 'remove', QUEUE_CALLS.dequeue, 1500);
    const afterLifeSnapshot = createVisualSnapshot({
      nodes, head: oldHead, tail: snake.tail, livesRemaining,
      memoryText: `Hunger used one life; ${livesRemaining} ${livesRemaining === 1 ? 'life' : 'lives'} remain.`
    });
    const removed = snake.size > 1 ? snake.removeFirst() : null;
    if (removed) pushGhosts([removed], 'hunger', 275);
    const afterSnapshot = createVisualSnapshot({
      nodes: snake.toArray(), ghosts: memoryGhosts.slice(), currentId: removed?.id ?? null,
      livesRemaining,
      memoryText: removed
        ? `${QUEUE_CALLS.dequeue} removed the former head; ${livesRemaining} ${livesRemaining === 1 ? 'life' : 'lives'} remain.`
        : `The sole node stays in the queue; this hunger event still cost one life (${livesRemaining} remain).`
    });
    nextMoveAt = Infinity;

    if (livesRemaining === 0) {
      const finalMessage = removed
        ? `Sixth hunger event: ${QUEUE_CALLS.dequeue} removed one head, then normal game over begins.`
        : `Sixth hunger event used the last life; the sole node stays until normal game over.`;
      setEvent(finalMessage, true);
      const finalHungerLines = removed ? [11, 12, 13, 15] : [11, 12, 15];
      finalHungerLines.forEach((line, index) => recordTraceStep({
        mode: 'remove', focus: [line], skip: removed ? [] : [13],
        caption: 'The sixth hunger event uses the last life, then starts the normal (non-red) game-over clear.',
        label: `Last life · line ${line + 1}`, eventText: finalMessage, eventHighlight: true,
        snapshot: afterSnapshot
      }, index, finalHungerLines.length));
      endRun('hunger');
      return;
    }

    setEvent(removed
      ? `Hunger: ${QUEUE_CALLS.dequeue} removed the head; ${livesRemaining} ${livesRemaining === 1 ? 'life' : 'lives'} remain.`
      : `Hunger: the sole node stays; one life is still spent (${livesRemaining} remain).`, true);
    beginTrace(hungerSteps(afterLifeSnapshot, afterSnapshot, Boolean(removed)));
  }

  function enterReviewPause(sourceState = gameState) {
    if (!['playing', 'ending', 'ended'].includes(sourceState)) return false;
    pausedFromState = sourceState;
    pauseStartedAt = performance.now();
    gameState = 'paused';
    lastFrame = null;
    setStatus('paused');
    if (sourceState === 'playing') {
      if (traceSequence) {
        pauseLiveEntry = null;
        historyCursor = historyEntries.length - 1;
      } else {
        pauseLiveEntry = makePauseEntry();
        historyCursor = historyEntries.length;
      }
    } else {
      pauseLiveEntry = null;
      historyCursor = Math.max(0, historyEntries.length - 1);
    }
    showReviewEntry(historyCursor);
    return true;
  }

  function resumeFromReview() {
    if (gameState !== 'paused') return;
    pauseReversePlayback();
    const returnState = pausedFromState;
    const now = performance.now();
    if (returnState === 'ending' && gameOverAnimation) {
      gameOverAnimation.nextAt += Math.max(0, now - pauseStartedAt);
    }
    gameState = returnState;
    pauseLiveEntry = null;
    historyCursor = Math.max(-1, historyEntries.length - 1);
    visualSnapshot = null;

    if (returnState === 'playing') {
      lastFrame = now;
      setStatus('playing');
      showLiveView();
      scheduleFrame();
      return;
    }
    if (returnState === 'ending') {
      lastFrame = now;
      setStatus('ending');
      const flashing = gameOverAnimation?.phase === 'flash';
      traceStepCount.textContent = `Head removals · ${gameOverAnimation?.removed || 0} / ${gameOverAnimation?.total || 0}`;
      displayEvent(liveEventMessage, liveEventHighlight);
      renderCode('ending', {
        focus: flashing ? [1] : [2],
        caption: flashing ? 'After the red impact, clear one head node per loop.' : `${QUEUE_CALLS.dequeue} removes the current head; repeat until the queue is empty.`
      });
      renderBoard();
      renderMemory();
      updateHud();
      updateReviewControls();
      scheduleFrame();
      return;
    }
    lastFrame = null;
    setStatus('ended');
    traceStepCount.textContent = 'Game over';
    displayEvent(liveEventMessage, liveEventHighlight);
    renderCode('ending', { focus: [1], caption: 'snake.isEmpty() is true; the clear loop ends.' });
    renderBoard();
    renderMemory();
    updateHud();
    updateReviewControls();
  }

  function togglePause() {
    if (gameState === 'playing') enterReviewPause('playing');
    else if (gameState === 'paused') resumeFromReview();
  }

  function setDirection(name) {
    if (gameState !== 'playing' || !DIRS[name]) return;
    const current = directionQueue.length ? directionQueue[directionQueue.length - 1] : direction;
    if (name === current || OPPOSITE[current] === name) return;
    if (directionQueue.length < 2) directionQueue.push(name);
  }

  function directionFromKey(key) {
    const map = {
      arrowup: 'up', w: 'up', arrowright: 'right', d: 'right',
      arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left'
    };
    if (!map[key]) return false;
    setDirection(map[key]);
    return true;
  }

  function scheduleFrame() {
    if (frameRequestPending) return;
    frameRequestPending = true;
    requestAnimationFrame(frame);
  }

  function frame(now) {
    frameRequestPending = false;
    if (document.hidden) {
      lastFrame = null;
      return;
    }
    if (gameState === 'ending') {
      scheduleFrame();
      advanceGameOverAnimation(now);
      return;
    }
    if (gameState === 'paused') {
      if (reversePlayback) {
        scheduleFrame();
        advanceReversePlayback(now);
      }
      lastFrame = null;
      return;
    }
    if (gameState === 'ended') {
      if (reversePlayback) {
        scheduleFrame();
        advanceReversePlayback(now);
      }
      lastFrame = null;
      return;
    }
    if (gameState !== 'playing') {
      lastFrame = null;
      return;
    }
    scheduleFrame();
    if (lastFrame === null) lastFrame = now;
    const delta = Math.min(Math.max(0, now - lastFrame), 200);
    lastFrame = now;
    elapsedMs += delta;
    pruneGhosts(now);

    if (traceSequence) {
      if (elapsedMs >= traceSequence.nextAt) advanceTrace();
      if (now - lastHudAt > 120) { updateHud(); lastHudAt = now; }
      return;
    }

    if (elapsedMs >= nextMoveAt) {
      nextMoveAt = Infinity;
      beginSnakeMove();
    }
    if (gameState !== 'playing' || traceSequence) {
      updateHud();
      return;
    }
    const hungerMs = hungerDuration();
    if (hungerMs && elapsedMs >= nextHungerAt) {
      nextHungerAt += hungerMs;
      hungerTick();
    }
    if (now - lastHudAt > 120) { updateHud(); lastHudAt = now; }
  }

  function initEvents() {
    $$('.color-option').forEach((button) => button.addEventListener('click', () => setColor(button.dataset.color)));
    $$('.difficulty-option').forEach((button) => button.addEventListener('click', () => setSpeed(button.dataset.difficulty)));
    startButton.addEventListener('click', startRun);
    pauseButton.addEventListener('click', togglePause);
    restartButton.addEventListener('click', startRun);
    codeCollapseButton.addEventListener('click', () => togglePanel('code'));
    memoryCollapseButton.addEventListener('click', () => togglePanel('memory'));
    restorePanelsButton.addEventListener('click', restorePanels);
    $('#setupButton').addEventListener('click', showSetup);
    $('#brandHome').addEventListener('click', (event) => { event.preventDefault(); showSetup(); });
    tracePreviousButton.addEventListener('click', previousReviewStep);
    traceNextButton.addEventListener('click', nextReviewStep);
    traceReverseButton.addEventListener('click', playTraceBackward);
    tracePauseButton.addEventListener('click', pauseReversePlayback);
    $$('.code-tab').forEach((button) => button.addEventListener('click', () => reviewCode(button.dataset.codeMode)));
    $$('.touch-controls [data-direction]').forEach((button) => button.addEventListener('click', () => setDirection(button.dataset.direction)));
    document.addEventListener('visibilitychange', () => {
      lastFrame = null;
      if (!document.hidden && (gameState === 'playing' || gameState === 'ending' || (reversePlayback && isReviewState()))) scheduleFrame();
    });

    document.addEventListener('keydown', (event) => {
      if (event.target && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (directionFromKey(key)) {
        if (gameState === 'playing') event.preventDefault();
        return;
      }
      if ((key === ' ' || key === 'spacebar') && (gameState === 'playing' || gameState === 'paused')) {
        event.preventDefault();
        togglePause();
      } else if (key === 'escape' && gameState === 'playing') {
        togglePause();
      } else if (key === 'r' && (gameState === 'playing' || gameState === 'paused' || gameState === 'ending' || gameState === 'ended')) {
        startRun();
      }
    });
  }

  function init() {
    bestTimeMs = loadBestTime();
    renderBestTime();
    setColor('mint');
    setSpeed('easy');
    renderCode('setup');
    updateRightStackLayout();
    setStatus('setup');
    initEvents();
    updateReviewControls();
  }

  init();
})();
