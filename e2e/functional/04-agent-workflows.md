# Test Suite: Agent Workflows

## Overview
Tests for agent lifecycle management, monitoring, logging, and coordination.

## Preconditions
- Application running at http://localhost:1420
- An active session with tasks exists
- Agent executables (Claude Code, etc.) available

---

## Test: Spawn Agent - Basic

### Description
Verify basic agent spawning for a task.

### Steps
1. **Navigate** to task detail view
   - Expected: Task detail loads

2. **Click** "Spawn Agent" or "Start Agent" button
   - Expected: Agent configuration dialog appears

3. **Select** agent type (e.g., "Claude Code")
   - Expected: Agent type selected

4. **Click** start/spawn button
   - Expected: Agent starts

5. **Verify** agent status indicator
   - Expected: Running status shown

### Expected Outcome
- Agent spawns successfully and shows running status

---

## Test: View Agent Status

### Description
Verify agent status display.

### Steps
1. **Navigate** to session with running agent
   - Expected: Session detail loads

2. **Click** agents tab or section
   - Expected: Agents list loads

3. **Verify** agent card displays status
   - Expected: Running/idle/stopped status shown

4. **Verify** agent shows task assignment
   - Expected: Associated task visible

### Expected Outcome
- Agent status is clearly displayed

---

## Test: View Agent Metrics

### Description
Verify agent metrics and statistics.

### Steps
1. **Navigate** to agent detail view
   - Expected: Agent detail loads

2. **Verify** runtime duration displayed
   - Expected: Time running shown

3. **Verify** resource metrics (if available)
   - Expected: CPU/memory usage displayed

4. **Verify** activity metrics
   - Expected: Actions/operations count shown

### Expected Outcome
- Agent metrics provide performance insight

---

## Test: Stop Agent

### Description
Verify agent can be stopped gracefully.

### Steps
1. **Navigate** to session with running agent
   - Expected: Session loads

2. **Click** stop button on agent
   - Expected: Stop confirmation may appear

3. **Confirm** stop action (if required)
   - Expected: Agent stops

4. **Verify** agent status changes
   - Expected: Stopped status shown

### Expected Outcome
- Agent stops gracefully

---

## Test: Pause and Resume Agent

### Description
Verify agent pause and resume functionality.

### Steps
1. **Navigate** to session with running agent
   - Expected: Agent is running

2. **Click** pause button
   - Expected: Agent pauses

3. **Verify** paused status
   - Expected: Paused indicator shown

4. **Click** resume button
   - Expected: Agent resumes

5. **Verify** running status
   - Expected: Running indicator shown

### Expected Outcome
- Agent can be paused and resumed

---

## Test: Restart Agent

### Description
Verify agent restart functionality.

### Steps
1. **Navigate** to session with stopped agent
   - Expected: Agent is stopped

2. **Click** restart button
   - Expected: Agent restarts

3. **Verify** agent running again
   - Expected: Running status shown

### Expected Outcome
- Agent restarts successfully

---

## Test: View Agent Logs

### Description
Verify agent log display.

### Steps
1. **Navigate** to agent detail view
   - Expected: Agent detail loads

2. **Click** logs tab or section
   - Expected: Logs panel opens

3. **Verify** log entries displayed
   - Expected: Agent output visible

4. **Verify** log timestamps
   - Expected: Each entry has timestamp

5. **Verify** log scrolling
   - Expected: Can scroll through log history

### Expected Outcome
- Agent logs are visible and navigable

---

## Test: Filter Agent Logs

### Description
Verify log filtering by level/type.

### Steps
1. **Navigate** to agent logs view
   - Expected: Logs displayed

2. **Click** log level filter
   - Expected: Filter options appear (info, warning, error)

3. **Select** error level
   - Expected: Only errors shown

4. **Clear** filter
   - Expected: All logs visible

### Expected Outcome
- Log filtering works correctly

---

## Test: Search Agent Logs

### Description
Verify log search functionality.

### Steps
1. **Navigate** to agent logs view
   - Expected: Logs displayed

2. **Fill** search input with keyword
   - Expected: Search query entered

3. **Verify** matching logs highlighted
   - Expected: Matches visible or filtered

4. **Clear** search
   - Expected: Full logs restored

### Expected Outcome
- Log search finds matching entries

---

## Test: Export Agent Logs

### Description
Verify log export functionality.

### Steps
1. **Navigate** to agent logs view
   - Expected: Logs displayed

2. **Click** export button
   - Expected: Export options appear

3. **Select** export format
   - Expected: Export initiates

4. **Verify** export feedback
   - Expected: Download or success message

### Expected Outcome
- Agent logs can be exported

---

## Test: View Subagent Tree

### Description
Verify subagent hierarchy visualization.

### Steps
1. **Navigate** to agent with subagents
   - Expected: Agent detail loads

2. **Click** subagent tree view
   - Expected: Tree visualization loads

3. **Verify** parent agent at root
   - Expected: Main agent visible

4. **Verify** subagents as children
   - Expected: Hierarchy displayed

5. **Click** on subagent node
   - Expected: Subagent details shown

### Expected Outcome
- Subagent tree displays agent hierarchy

---

## Test: Agent Auto-Recovery

### Description
Verify agent recovery after crash.

### Steps
1. **Navigate** to session with agent
   - Expected: Agent status visible

2. **Verify** recovery options displayed (if agent crashed)
   - Expected: Restart or dismiss options

3. **Click** restart if crashed
   - Expected: Agent recovers

### Expected Outcome
- Crashed agents show recovery options

---

## Test: Multiple Agents Coordination

### Description
Verify multiple agents working together.

### Steps
1. **Navigate** to session with multiple tasks
   - Expected: Session loads

2. **Spawn** agents for multiple tasks
   - Expected: Multiple agents start

3. **Verify** all agents show in list
   - Expected: Agent count matches spawned

4. **Verify** each agent assigned to correct task
   - Expected: Task assignments visible

5. **Verify** no conflicts between agents
   - Expected: Agents work independently

### Expected Outcome
- Multiple agents coordinate without conflicts

---

## Test: Agent Rate Limiting

### Description
Verify rate limiting indicators.

### Steps
1. **Navigate** to agent detail view
   - Expected: Agent detail loads

2. **Verify** rate limit indicator (if applicable)
   - Expected: Rate limit status shown

3. **Verify** wait time displayed (if rate limited)
   - Expected: Countdown or delay shown

### Expected Outcome
- Rate limiting status is visible when applicable

---

## Test: Agent Error Handling

### Description
Verify error state display and recovery.

### Steps
1. **Navigate** to agent with errors
   - Expected: Agent detail loads

2. **Verify** error indicator visible
   - Expected: Error badge or status

3. **Click** to view error details
   - Expected: Error message displayed

4. **Verify** recovery options
   - Expected: Retry or dismiss options

### Expected Outcome
- Agent errors are displayed with recovery options

---

## Test: Kill All Agents

### Description
Verify bulk agent termination.

### Steps
1. **Navigate** to session with multiple agents
   - Expected: Multiple agents running

2. **Click** "Stop All Agents" button
   - Expected: Confirmation dialog appears

3. **Confirm** stop all
   - Expected: All agents stop

4. **Verify** all agents stopped
   - Expected: All show stopped status

### Expected Outcome
- All agents can be stopped at once

---

## Test: Agent Configuration

### Description
Verify agent configuration options.

### Steps
1. **Navigate** to agent spawn dialog
   - Expected: Configuration options visible

2. **Verify** model selection (if applicable)
   - Expected: Model dropdown available

3. **Verify** working directory option
   - Expected: Directory selector available

4. **Verify** additional options
   - Expected: Custom flags or settings visible

### Expected Outcome
- Agent configuration options are accessible

---

## Test: Agent Timeout Handling

### Description
Verify agent timeout behavior.

### Steps
1. **Navigate** to agent with long-running task
   - Expected: Agent running

2. **Verify** timeout warning (if applicable)
   - Expected: Warning before timeout

3. **Verify** timeout action
   - Expected: Agent stops or prompts for extension

### Expected Outcome
- Agent timeouts are handled gracefully

---

## Test: Agent Output Streaming

### Description
Verify real-time output streaming.

### Steps
1. **Navigate** to running agent logs
   - Expected: Logs panel open

2. **Verify** output updates in real-time
   - Expected: New entries appear without refresh

3. **Verify** scroll follows output (auto-scroll)
   - Expected: View follows new content

4. **Click** to disable auto-scroll
   - Expected: Scroll position maintained

### Expected Outcome
- Agent output streams in real-time

---

## Test: Agent Terminal Input

### Description
Verify terminal input to agent (if supported).

### Steps
1. **Navigate** to agent terminal view
   - Expected: Terminal interface loads

2. **Type** input command
   - Expected: Input sent to agent

3. **Verify** agent response
   - Expected: Output displayed

### Expected Outcome
- Terminal input reaches agent and shows response

---

## Test: Agent Notification on Completion

### Description
Verify notification when agent completes.

### Steps
1. **Navigate** to session with running agent
   - Expected: Agent running

2. **Wait** for agent to complete task
   - Expected: Agent finishes

3. **Verify** completion notification
   - Expected: Toast or alert shown

4. **Verify** agent status updated
   - Expected: Completed status displayed

### Expected Outcome
- Notification appears when agent completes

---

## Test: Agent Progress Tracking

### Description
Verify progress indicators during execution.

### Steps
1. **Navigate** to running agent detail
   - Expected: Agent detail loads

2. **Verify** progress indicator
   - Expected: Progress bar or percentage

3. **Verify** current step/phase shown
   - Expected: What agent is doing now

### Expected Outcome
- Agent progress is visible during execution

---

## Test: View Agent History

### Description
Verify completed agent history.

### Steps
1. **Navigate** to session agents tab
   - Expected: Agents list loads

2. **Click** history or completed tab
   - Expected: Past agents shown

3. **Verify** completed agents listed
   - Expected: Agent run history visible

4. **Click** on historical agent
   - Expected: Details accessible

### Expected Outcome
- Agent history shows past executions

---

## Test: Agent Quick Actions

### Description
Verify quick action buttons on agent cards.

### Steps
1. **Navigate** to agents list
   - Expected: Agent cards visible

2. **Hover** over agent card
   - Expected: Quick actions appear

3. **Verify** available actions
   - Expected: View, Stop, Restart available

4. **Click** quick action
   - Expected: Action executes

### Expected Outcome
- Quick actions accessible on agent cards

---

## Test: Agent Comparison

### Description
Verify comparing multiple agent runs.

### Steps
1. **Navigate** to agent history
   - Expected: Multiple runs listed

2. **Select** two runs for comparison
   - Expected: Runs selected

3. **Click** compare button
   - Expected: Comparison view opens

4. **Verify** side-by-side data
   - Expected: Metrics compared

### Expected Outcome
- Agent runs can be compared
