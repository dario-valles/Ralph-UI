// Integration tests for StreamingParser and AgentManager interaction
// Verifies US-SP-6: Integration Tests

#[cfg(test)]
mod streaming_integration_tests {
    use ralph_ui_lib::agents::manager::AgentManager;
    use ralph_ui_lib::agents::trace_parser::SubagentEventType;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn test_agent_manager_emits_subagent_events() {
        // 1. Setup AgentManager and channels
        let mut manager = AgentManager::new();
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.set_subagent_sender(tx);

        let agent_id = "test-agent-1";

        // 2. Simulate PTY data containing subagent events
        // Note: StreamingParser expects clean lines, but AgentManager handles ANSI stripping
        // We'll simulate data arriving in chunks

        // Chunk 1: Spawn a task
        let chunk1 = "⠋ Task: Search for files\r\n";
        manager.process_pty_data(agent_id, chunk1.as_bytes());

        // Verify Spawned event
        let event1: ralph_ui_lib::agents::SubagentEvent =
            rx.recv().await.expect("Should receive Spawned event");
        assert_eq!(event1.event_type, SubagentEventType::Spawned);
        assert_eq!(event1.description, "Search for files");
        assert_eq!(event1.subagent_id, format!("{}-sub-1", agent_id));

        // Chunk 2: Progress update
        let chunk2 = "⠙ Searching for specific patterns...\r\n";
        manager.process_pty_data(agent_id, chunk2.as_bytes());

        // Verify Progress event
        let event2: ralph_ui_lib::agents::SubagentEvent =
            rx.recv().await.expect("Should receive Progress event");
        assert_eq!(event2.event_type, SubagentEventType::Progress);
        assert_eq!(event2.description, "Searching for specific patterns...");

        // Chunk 3: Completion
        let chunk3 = "✓ Task completed\r\n";
        manager.process_pty_data(agent_id, chunk3.as_bytes());

        // Verify Completed event
        let event3: ralph_ui_lib::agents::SubagentEvent =
            rx.recv().await.expect("Should receive Completed event");
        assert_eq!(event3.event_type, SubagentEventType::Completed);
        assert_eq!(event3.description, "Task completed");
    }

    #[tokio::test]
    async fn test_agent_manager_handles_nested_subagents_stream() {
        // 1. Setup
        let mut manager = AgentManager::new();
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.set_subagent_sender(tx);

        let agent_id = "test-agent-nested";

        // 2. Simulate nested flow

        // Outer task
        manager.process_pty_data(agent_id, "⠋ Task: Outer Operation\r\n".as_bytes());
        let evt_outer_start: ralph_ui_lib::agents::SubagentEvent = rx.recv().await.unwrap();
        assert_eq!(evt_outer_start.depth, 0);

        // Inner task
        manager.process_pty_data(agent_id, "⠋ Task: Inner Detail\r\n".as_bytes());
        let evt_inner_start: ralph_ui_lib::agents::SubagentEvent = rx.recv().await.unwrap();
        assert_eq!(evt_inner_start.depth, 1);
        assert_eq!(evt_inner_start.description, "Inner Detail");

        // Inner completion
        manager.process_pty_data(agent_id, "✓ Task completed\r\n".as_bytes());
        let evt_inner_end: ralph_ui_lib::agents::SubagentEvent = rx.recv().await.unwrap();
        assert_eq!(evt_inner_end.event_type, SubagentEventType::Completed);
        assert_eq!(evt_inner_end.depth, 1);

        // Outer completion
        manager.process_pty_data(agent_id, "✓ Task completed\r\n".as_bytes());
        let evt_outer_end: ralph_ui_lib::agents::SubagentEvent = rx.recv().await.unwrap();
        assert_eq!(evt_outer_end.event_type, SubagentEventType::Completed);
        assert_eq!(evt_outer_end.depth, 0);
    }

    #[tokio::test]
    async fn test_agent_manager_maintains_tree_state() {
        // 1. Setup
        let mut manager = AgentManager::new();
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.set_subagent_sender(tx);

        let agent_id = "test-agent-tree";

        // 2. Send events
        manager.process_pty_data(agent_id, "⠋ Task: Root Task\r\n".as_bytes());
        let _ = rx.recv().await; // Consume event

        manager.process_pty_data(agent_id, "⠋ Task: Child Task\r\n".as_bytes());
        let _ = rx.recv().await; // Consume event

        // 3. Inspect tree state via Manager
        // Note: AgentManager keeps tree state internally. We can check if it's accessible.
        // The `get_subagent_tree` method should return the current state.

        let tree = manager
            .get_subagent_tree(agent_id)
            .expect("Tree should exist");

        assert_eq!(tree.events.len(), 2);
        assert_eq!(tree.active.len(), 2); // Both still active

        // Complete child
        manager.process_pty_data(agent_id, "✓ Task completed\r\n".as_bytes());
        let _ = rx.recv().await;

        let tree_after = manager.get_subagent_tree(agent_id).unwrap();
        assert_eq!(tree_after.active.len(), 1); // Only root active
        assert!(tree_after.active[0].ends_with("-sub-1")); // Root ID
    }
}
