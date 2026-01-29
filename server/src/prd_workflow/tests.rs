//! Tests for prd_workflow module

use super::*;
use tempfile::TempDir;

#[test]
fn test_full_workflow_lifecycle() {
    let temp_dir = TempDir::new().unwrap();
    let project_path = temp_dir.path();
    let workflow_id = "test-lifecycle";

    // Initialize workflow
    storage::init_workflow(project_path, workflow_id).unwrap();

    // Create initial state
    let mut state = PrdWorkflowState::new(
        workflow_id.to_string(),
        project_path.to_string_lossy().to_string(),
        WorkflowMode::New,
    );

    // Set context
    state.context.what = Some("A task management app".to_string());
    state.context.why = Some("Teams need better collaboration".to_string());
    state.context.who = Some("Remote workers".to_string());
    state.context.done = Some("Users can create and track tasks".to_string());
    assert!(state.context.is_complete());

    // Save and reload
    storage::save_workflow_state(project_path, workflow_id, &state).unwrap();
    let loaded = storage::load_workflow_state(project_path, workflow_id).unwrap();
    assert_eq!(loaded.context.what, state.context.what);

    // Advance through phases
    assert_eq!(state.phase, WorkflowPhase::Discovery);
    state.advance_phase();
    assert_eq!(state.phase, WorkflowPhase::Research);
    state.advance_phase();
    assert_eq!(state.phase, WorkflowPhase::Requirements);

    // Add requirements with dependencies
    let id1 = state.add_requirement(
        state::RequirementCategory::Core,
        "User Authentication".to_string(),
        "Users can create accounts and log in".to_string(),
    );
    let id2 = state.add_requirement(
        state::RequirementCategory::Core,
        "Task Creation".to_string(),
        "Users can create new tasks".to_string(),
    );
    let id3 = state.add_requirement(
        state::RequirementCategory::Core,
        "Task Assignment".to_string(),
        "Users can assign tasks to team members".to_string(),
    );

    // Add dependencies: Task Assignment depends on both Auth and Task Creation
    state.dependency_graph.add_dependency(&id3, &id1).unwrap();
    state.dependency_graph.add_dependency(&id3, &id2).unwrap();

    // Also update the requirement's depends_on field for status tracking
    if let Some(req) = state.get_requirement_mut(&id3) {
        req.depends_on = vec![id1.clone(), id2.clone()];
    }

    // Validate no cycles
    assert!(state.dependency_graph.validate().is_ok());

    // Check execution order
    let order = state.get_execution_order().unwrap();
    let pos_auth = order.iter().position(|x| x == &id1).unwrap();
    let pos_task = order.iter().position(|x| x == &id2).unwrap();
    let pos_assign = order.iter().position(|x| x == &id3).unwrap();

    // Auth and Task Creation should come before Task Assignment
    assert!(pos_auth < pos_assign);
    assert!(pos_task < pos_assign);

    // Check ready requirements
    state.update_requirement_statuses();
    let ready = state.get_ready_requirements();
    // Auth and Task Creation should be ready (no deps)
    let ready_ids: Vec<_> = ready.iter().map(|r| r.id.as_str()).collect();
    assert!(ready_ids.contains(&id1.as_str()));
    assert!(ready_ids.contains(&id2.as_str()));
    assert!(!ready_ids.contains(&id3.as_str())); // Task Assignment is blocked

    // Complete workflow
    state.advance_phase(); // Planning
    state.advance_phase(); // Export
    assert_eq!(state.phase, WorkflowPhase::Export);
    state.advance_phase(); // Complete
    assert!(state.is_complete);
}

#[test]
fn test_dependency_cycle_detection() {
    let mut graph = DependencyGraph::new();

    // Create a simple cycle: A → B → C → A
    graph.add_dependency("A", "B").unwrap();
    graph.add_dependency("B", "C").unwrap();
    graph.add_dependency("C", "A").unwrap();

    // Should detect the cycle
    let result = graph.validate();
    assert!(matches!(
        result,
        Err(DependencyValidationError::CycleDetected(_))
    ));
}

#[test]
fn test_dependency_diamond_no_cycle() {
    let mut graph = DependencyGraph::new();

    // Diamond pattern: D depends on both B and C, which both depend on A
    graph.add_dependency("D", "B").unwrap();
    graph.add_dependency("D", "C").unwrap();
    graph.add_dependency("B", "A").unwrap();
    graph.add_dependency("C", "A").unwrap();

    // Should be valid (no cycle)
    assert!(graph.validate().is_ok());

    // Execution order should have A first, then B and C, then D
    let order = graph.execution_order().unwrap();
    let pos_a = order.iter().position(|x| x == "A").unwrap();
    let pos_b = order.iter().position(|x| x == "B").unwrap();
    let pos_c = order.iter().position(|x| x == "C").unwrap();
    let pos_d = order.iter().position(|x| x == "D").unwrap();

    assert!(pos_a < pos_b);
    assert!(pos_a < pos_c);
    assert!(pos_b < pos_d);
    assert!(pos_c < pos_d);
}

#[test]
fn test_research_config_customization() {
    // Default config
    let config = ResearchConfig::default();
    assert_eq!(config.agents.len(), 4);
    assert!(config.parallel);

    // Add Ideas agent
    let config = config.with_ideas_agent();
    assert_eq!(config.agents.len(), 5);

    // Filter for new project (no codebase)
    let filtered = config.filter_for_mode(false);
    // Should remove codebase and ideas (both require codebase)
    assert_eq!(filtered.agents.len(), 3);

    // Custom config
    let custom = ResearchConfig::default()
        .with_cli_agent("cursor")
        .with_model("gpt-4")
        .with_timeout(300)
        .with_parallel(false);

    assert_eq!(custom.cli_agent_type, "cursor");
    assert_eq!(custom.model, Some("gpt-4".to_string()));
    assert_eq!(custom.timeout_secs, 300);
    assert!(!custom.parallel);
}

#[test]
fn test_spec_state_generation() {
    let spec = SpecState {
        current: StateDescription {
            summary: "Current application state".to_string(),
            user_flows: vec!["Login flow".to_string(), "Dashboard view".to_string()],
            components: vec!["AuthService".to_string(), "DashboardView".to_string()],
            data_models: vec!["User".to_string(), "Session".to_string()],
            constraints: vec!["Must support mobile".to_string()],
        },
        desired: StateDescription {
            summary: "Desired application state with new features".to_string(),
            user_flows: vec![
                "Login flow".to_string(),
                "Dashboard view".to_string(),
                "Task management".to_string(),
            ],
            components: vec![
                "AuthService".to_string(),
                "DashboardView".to_string(),
                "TaskManager".to_string(),
            ],
            data_models: vec![
                "User".to_string(),
                "Session".to_string(),
                "Task".to_string(),
            ],
            constraints: vec![
                "Must support mobile".to_string(),
                "Offline support".to_string(),
            ],
        },
        implementation_notes: vec![
            "Add Task model and migration".to_string(),
            "Create TaskManager component".to_string(),
        ],
    };

    let md = storage::generate_spec_md(&spec);

    assert!(md.contains("# Specification"));
    assert!(md.contains("## Current State"));
    assert!(md.contains("## Desired State"));
    assert!(md.contains("Login flow"));
    assert!(md.contains("TaskManager"));
    assert!(md.contains("## Implementation Notes"));
}

#[test]
fn test_workflow_phase_skip() {
    let mut state =
        PrdWorkflowState::new("test".to_string(), "/path".to_string(), WorkflowMode::New);

    assert_eq!(state.phase, WorkflowPhase::Discovery);

    // Skip Discovery
    state.skip_phase();
    assert_eq!(state.phase, WorkflowPhase::Research);

    let status = state.phase_statuses.get("discovery").unwrap();
    assert_eq!(*status, PhaseStatus::Skipped);

    // Skip Research too
    state.skip_phase();
    assert_eq!(state.phase, WorkflowPhase::Requirements);

    let status = state.phase_statuses.get("research").unwrap();
    assert_eq!(*status, PhaseStatus::Skipped);
}

#[test]
fn test_requirement_status_updates() {
    let mut state =
        PrdWorkflowState::new("test".to_string(), "/path".to_string(), WorkflowMode::New);

    // Add requirements
    let auth_id = state.add_requirement(
        state::RequirementCategory::Security,
        "Authentication".to_string(),
        "User auth".to_string(),
    );
    let task_id = state.add_requirement(
        state::RequirementCategory::Core,
        "Tasks".to_string(),
        "Task management".to_string(),
    );
    let assign_id = state.add_requirement(
        state::RequirementCategory::Core,
        "Assignment".to_string(),
        "Task assignment".to_string(),
    );

    // Assignment depends on both auth and tasks
    state
        .dependency_graph
        .add_dependency(&assign_id, &auth_id)
        .unwrap();
    state
        .dependency_graph
        .add_dependency(&assign_id, &task_id)
        .unwrap();

    // Also update the requirement's depends_on field
    if let Some(req) = state.get_requirement_mut(&assign_id) {
        req.depends_on = vec![auth_id.clone(), task_id.clone()];
    }

    // Update statuses
    state.update_requirement_statuses();

    // Auth and tasks should be Ready (no deps)
    assert_eq!(
        state.get_requirement(&auth_id).unwrap().status,
        state::RequirementStatus::Ready
    );
    assert_eq!(
        state.get_requirement(&task_id).unwrap().status,
        state::RequirementStatus::Ready
    );
    // Assignment should be Blocked
    assert_eq!(
        state.get_requirement(&assign_id).unwrap().status,
        state::RequirementStatus::Blocked
    );

    // Complete auth
    if let Some(req) = state.get_requirement_mut(&auth_id) {
        req.status = state::RequirementStatus::Done;
    }
    state.update_requirement_statuses();

    // Assignment still blocked (tasks not done)
    assert_eq!(
        state.get_requirement(&assign_id).unwrap().status,
        state::RequirementStatus::Blocked
    );

    // Complete tasks
    if let Some(req) = state.get_requirement_mut(&task_id) {
        req.status = state::RequirementStatus::Done;
    }
    state.update_requirement_statuses();

    // Assignment now ready
    assert_eq!(
        state.get_requirement(&assign_id).unwrap().status,
        state::RequirementStatus::Ready
    );
}
