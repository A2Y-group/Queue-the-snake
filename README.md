# Queue, the snake

A small static browser game for learning FIFO behavior through a snake-like visual. Open `index.html` directly or publish the folder with GitHub Pages; there is no build step or server-side component.

## LinkedQueue model

The **Java Pseudo-code** panel shows a custom singly linked queue called `LinkedQueue`, shared by the game through the variable `snake`. Its Java-style sketches are teaching examples; the browser game itself is JavaScript.

The three starting nodes contain `0`, `1`, and `2`. A new node's value is its zero-based tail index at insertion. Each movement calls `offer`; on an ordinary move it then calls `poll`, so the size stays the same. A node that is kept for growth takes the current size as its new tail index; an ordinary move uses `size - 1`:

```java
int growthUnits = growthRemaining + appleGrowth;
boolean willGrow = growthUnits > 0;
int val = snake.size() - 1 + (willGrow ? 1 : 0);
snake.offer(val);
```

For example, if the queue currently has 17 nodes and the move keeps a growth node, the new tail index is `17`, so the popup shows `offer(17)`. `offer(18)` would be the new queue length, not the zero-based tail index. Fast apples grant two growth units: the first is kept immediately, then the second is kept on the next move using that move's current size as its tail index.

The integer-specific `offer` implementation creates and links the node:

```java
boolean offer(int val) {
    Node<Integer> newNode = new Node<>(val);
    if (head == null) head = newNode;
    else tail.next = newNode;
    tail = newNode;
    size++;
    return true;
}
```

`poll()` removes and returns the FIFO head value, updates the head and tail, decreases size, and shifts the remaining nodes' data (`0 .. size - 1`):

```java
Integer poll() {
    if (head == null) return null;
    Node<Integer> removed = head;
    head = head.next;
    if (head == null) tail = null;
    removed.next = null;
    size--; // remaining nodes shift data to 0..size-1
    return removed.data;
}
```

Java's standard `Queue<E>` interface declares `offer(E e)` and returns `boolean`; this custom sketch uses `int val` because the game examples store integers. Either way, `offer` receives a value and creates a node—it does not receive a `Node` object. `Node<E>` is next-only; it has no `prev` pointer.

## How the queue drives the snake

An ordinary move adds a tail node, then polls the head, so the queue size stays the same. Eating an apple keeps the head and grows the queue. Easy and Medium apples grant one growth unit; Fast apples display `2`, add one node immediately, and add the second on the following move. `growthRemaining` counts growth moves still owed—moves that add a tail node but skip `poll()`. A one-unit apple uses its unit on that move; Fast leaves one unit for the next move.

Hunger runs every 30 seconds on Easy, 20 seconds on Medium, and 10 seconds on Fast. Its deadline uses the elapsed-run-time clock: `nextHungerAt = elapsedMs + hungerIntervalMs`. For example, an apple eaten at 12 seconds on Easy sets the next deadline to 42 seconds. Apples reset the countdown but do not restore lives. The game starts with six lives; each hunger event costs one life and polls one head node when more than one node remains. Hunger never removes the sole node. After the sixth hunger event, `clearQueue()` empties the remaining nodes from head to tail. Self-collision turns the body red before the same cleanup; filling every board cell also ends the run. There are no enemies. The setup screen keeps a local personal best based on survival time, not apples eaten.

## Memory and teaching panels

Memory shows each node's name (`nodeHead`, `node1`, `node2`, …, `nodeTail`), `data` (`0`, `1`, `2`, …, `size - 1`), and `next` link (`→ node1`, `→ node2`, …, `→ nodeTail`, `null`). On the game board, nodes display `H=0`, `1`, `2`, …, `T=size-1`, matching the `data` values shown in Memory. Board cells are stored separately by the simulator. The queue and node diagrams are conceptual and next-only; they do not show Java's private `LinkedList` internals.

The tabs connect the shared `snake` queue across **LinkedQueue**, **Add**, **Remove**, and **Game over**. Movement is shown as Add followed by Remove on ordinary moves; apple-growth offers are kept without a removal. Hunger polling is shown in Remove, and the hunger-deadline helper is in LinkedQueue setup. `resetHungerTimer()` sets the next deadline to current elapsed run time plus the selected interval. **Java Pseudo-code** and **Memory** are open by default and can each be collapsed. Reverse replays the recorded trace backward; Pause stops reverse playback, and Previous/Next step one frame at a time.

## Controls and settings

Use the arrow keys or WASD to steer; Space pauses or resumes. Choose one of four snake colors and a difficulty. Target intervals are Easy 62.5 ms/move (shown as 63), Medium 7.8125 ms/move (shown as 8), and Fast 3.90625 ms/move (shown as 4). Medium is twice as fast as the former Fast setting, and Fast is twice as fast as Medium. Hunger intervals are 30, 20, and 10 seconds, respectively. The current apple count, survival time, queue size, hunger progress, and lives are shown during the run.

Removed-node ghosts fade in half their previous time: 0.375 seconds after ordinary moves, 0.275 seconds after hunger, and half the prior game-over ghost window (with an 80 ms minimum). The CSS fade duration is set to each ghost's lifetime.
