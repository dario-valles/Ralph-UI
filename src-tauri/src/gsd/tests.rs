//! Tests for the GSD (Get Stuff Done) workflow module
//!
//! These tests verify the core functionality of the GSD planning workflow.

#[cfg(test)]
mod tests {
    use crate::gsd::{
        config::{GsdConfig, RequirementCategory, ResearchAgentType, ScopeLevel},
        conversion::{convert_to_ralph_prd, ConversionOptions},
        planning_storage::{
            delete_planning_session, init_planning_session, list_planning_sessions,
            load_workflow_state, save_workflow_state, write_planning_file, PlanningFile,
        },
        requirements::{Requirement, RequirementsDoc, ScopeSelection},
        roadmap::{derive_roadmap, RoadmapDoc, RoadmapPhase},
        state::{GsdPhase, GsdWorkflowState, QuestioningContext},
        verification::verify_plans,
    };
    use tempfile::TempDir;

    /// Create a test project directory
    fn create_test_project() -> TempDir {
        TempDir::new().expect("Failed to create temp dir")
    }

    // ============================================================================
    // State Tests
    // ============================================================================

    #[test]
    fn test_gsd_workflow_state_new() {
        let state = GsdWorkflowState::new("test-session".to_string());

        assert_eq!(state.session_id, "test-session");
        assert_eq!(state.current_phase, GsdPhase::DeepQuestioning);
        assert!(!state.is_complete);
        assert!(state.decisions.is_empty());
    }

    #[test]
    fn test_gsd_phase_ordering() {
        let phases = [
            GsdPhase::DeepQuestioning,
            GsdPhase::ProjectDocument,
            GsdPhase::Research,
            GsdPhase::Requirements,
            GsdPhase::Scoping,
            GsdPhase::Roadmap,
            GsdPhase::Verification,
            GsdPhase::Export,
        ];

        // Verify phases are in expected order
        assert_eq!(phases.len(), 8);
        assert_eq!(phases[0], GsdPhase::DeepQuestioning);
        assert_eq!(phases[7], GsdPhase::Export);
    }

    #[test]
    fn test_questioning_context_default() {
        let context = QuestioningContext::default();

        assert!(context.what.is_none());
        assert!(context.why.is_none());
        assert!(context.who.is_none());
        assert!(context.done.is_none());
        assert!(context.notes.is_empty());
    }

    // ============================================================================
    // Planning Storage Tests
    // ============================================================================

    #[test]
    fn test_init_planning_session() {
        let temp_dir = create_test_project();
        let session_id = "test-session-001";

        let result = init_planning_session(temp_dir.path(), session_id);
        assert!(result.is_ok());

        // Verify directory was created
        let planning_dir = temp_dir.path().join(".ralph-ui/planning").join(session_id);
        assert!(planning_dir.exists());
        assert!(planning_dir.join("research").exists());
    }

    #[test]
    fn test_save_and_load_workflow_state() {
        let temp_dir = create_test_project();
        let session_id = "test-state-session";

        // Initialize session
        init_planning_session(temp_dir.path(), session_id).unwrap();

        // Create and save state
        let mut state = GsdWorkflowState::new(session_id.to_string());
        state.current_phase = GsdPhase::Research;
        state.questioning_context = QuestioningContext {
            what: Some("A task management app".to_string()),
            why: Some("Teams need better collaboration".to_string()),
            who: Some("Remote teams".to_string()),
            done: Some("Users can create and assign tasks".to_string()),
            notes: vec!["Consider mobile support".to_string()],
        };

        save_workflow_state(temp_dir.path(), session_id, &state).unwrap();

        // Load and verify
        let loaded = load_workflow_state(temp_dir.path(), session_id).unwrap();
        assert_eq!(loaded.session_id, session_id);
        assert_eq!(loaded.current_phase, GsdPhase::Research);
        assert_eq!(
            loaded.questioning_context.what,
            Some("A task management app".to_string())
        );
    }

    #[test]
    fn test_write_and_read_planning_file() {
        let temp_dir = create_test_project();
        let session_id = "test-file-session";

        init_planning_session(temp_dir.path(), session_id).unwrap();

        let content = "# Project Document\n\nThis is a test project.";
        write_planning_file(temp_dir.path(), session_id, PlanningFile::Project, content).unwrap();

        // Verify file exists
        let file_path = temp_dir
            .path()
            .join(".ralph-ui/planning")
            .join(session_id)
            .join("PROJECT.md");
        assert!(file_path.exists());
    }

    #[test]
    fn test_list_planning_sessions() {
        let temp_dir = create_test_project();

        // Create multiple sessions
        init_planning_session(temp_dir.path(), "session-1").unwrap();
        init_planning_session(temp_dir.path(), "session-2").unwrap();
        init_planning_session(temp_dir.path(), "session-3").unwrap();

        let sessions = list_planning_sessions(temp_dir.path()).unwrap();
        assert_eq!(sessions.len(), 3);
    }

    #[test]
    fn test_delete_planning_session() {
        let temp_dir = create_test_project();
        let session_id = "session-to-delete";

        init_planning_session(temp_dir.path(), session_id).unwrap();

        // Verify exists
        let sessions = list_planning_sessions(temp_dir.path()).unwrap();
        assert_eq!(sessions.len(), 1);

        // Delete
        delete_planning_session(temp_dir.path(), session_id).unwrap();

        // Verify deleted
        let sessions = list_planning_sessions(temp_dir.path()).unwrap();
        assert_eq!(sessions.len(), 0);
    }

    // ============================================================================
    // Requirements Tests
    // ============================================================================

    #[test]
    fn test_requirement_id_generation() {
        let mut doc = RequirementsDoc::new();

        let id1 = doc.add_requirement(
            RequirementCategory::Core,
            "Auth".to_string(),
            "User auth".to_string(),
        );
        let id2 = doc.add_requirement(
            RequirementCategory::Core,
            "Profile".to_string(),
            "User profile".to_string(),
        );
        let id3 = doc.add_requirement(
            RequirementCategory::Ui,
            "Dashboard".to_string(),
            "Main dashboard".to_string(),
        );

        assert_eq!(id1, "CORE-01");
        assert_eq!(id2, "CORE-02");
        assert_eq!(id3, "UI-01");
    }

    #[test]
    fn test_requirements_doc_creation() {
        let mut doc = RequirementsDoc::new();

        doc.add(Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "User authentication".to_string(),
            "Users can log in".to_string(),
        ));

        assert_eq!(doc.requirements.len(), 1);
        assert!(doc.get("CORE-01").is_some());
    }

    #[test]
    fn test_scope_selection_apply() {
        let mut doc = RequirementsDoc::new();

        doc.add(Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Feature 1".to_string(),
            "Description 1".to_string(),
        ));
        doc.add(Requirement::new(
            "CORE-02".to_string(),
            RequirementCategory::Core,
            "Feature 2".to_string(),
            "Description 2".to_string(),
        ));
        doc.add(Requirement::new(
            "UI-01".to_string(),
            RequirementCategory::Ui,
            "UI Feature".to_string(),
            "UI Description".to_string(),
        ));

        let selection = ScopeSelection {
            v1: vec!["CORE-01".to_string()],
            v2: vec!["CORE-02".to_string()],
            out_of_scope: vec!["UI-01".to_string()],
        };

        selection.apply(&mut doc);

        assert_eq!(doc.get("CORE-01").unwrap().scope, ScopeLevel::V1);
        assert_eq!(doc.get("CORE-02").unwrap().scope, ScopeLevel::V2);
        assert_eq!(doc.get("UI-01").unwrap().scope, ScopeLevel::OutOfScope);
    }

    // ============================================================================
    // Roadmap Tests
    // ============================================================================

    #[test]
    fn test_derive_roadmap_from_requirements() {
        let mut doc = RequirementsDoc::new();

        let mut req1 = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Authentication".to_string(),
            "User login".to_string(),
        );
        req1.scope = ScopeLevel::V1;

        let mut req2 = Requirement::new(
            "CORE-02".to_string(),
            RequirementCategory::Core,
            "Dashboard".to_string(),
            "Main dashboard".to_string(),
        );
        req2.scope = ScopeLevel::V1;
        req2.dependencies = vec!["CORE-01".to_string()];

        doc.add(req1);
        doc.add(req2);

        let roadmap = derive_roadmap(&doc);

        assert!(!roadmap.phases.is_empty());
        assert_eq!(roadmap.version, "v1");
    }

    #[test]
    fn test_roadmap_doc_to_markdown() {
        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Foundation".to_string(),
            description: "Set up core infrastructure".to_string(),
            requirement_ids: vec!["CORE-01".to_string()],
            effort_summary: "M".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let markdown = roadmap.to_markdown();
        assert!(markdown.contains("V1 Roadmap"));
        assert!(markdown.contains("Foundation"));
        assert!(markdown.contains("CORE-01"));
    }

    // ============================================================================
    // Verification Tests
    // ============================================================================

    #[test]
    fn test_verify_plans_all_covered() {
        let mut doc = RequirementsDoc::new();
        let mut req = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Feature".to_string(),
            "Description".to_string(),
        );
        req.scope = ScopeLevel::V1;
        doc.add(req);

        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Phase 1".to_string(),
            description: "Description".to_string(),
            requirement_ids: vec!["CORE-01".to_string()],
            effort_summary: "M".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let result = verify_plans(&doc, &roadmap);

        assert!(result.passed);
        assert_eq!(result.coverage_percentage, 100);
        assert!(result.issues.is_empty());
    }

    #[test]
    fn test_verify_plans_missing_coverage() {
        let mut doc = RequirementsDoc::new();

        let mut req1 = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Covered".to_string(),
            "Description".to_string(),
        );
        req1.scope = ScopeLevel::V1;

        let mut req2 = Requirement::new(
            "CORE-02".to_string(),
            RequirementCategory::Core,
            "Not covered".to_string(),
            "Description".to_string(),
        );
        req2.scope = ScopeLevel::V1;

        doc.add(req1);
        doc.add(req2);

        // Only include CORE-01 in roadmap
        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Phase 1".to_string(),
            description: "Description".to_string(),
            requirement_ids: vec!["CORE-01".to_string()],
            effort_summary: "M".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let result = verify_plans(&doc, &roadmap);

        assert!(!result.passed);
        // Coverage is about scoping, not roadmap coverage - both reqs are scoped so coverage is 100%
        // The V1_NOT_IN_ROADMAP issue causes it to fail
        assert!(!result.issues.is_empty());
        assert!(result
            .issues
            .iter()
            .any(|i| i.code == "V1_NOT_IN_ROADMAP"));
    }

    #[test]
    fn test_verify_orphaned_dependencies() {
        let mut doc = RequirementsDoc::new();

        let mut req = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "Feature".to_string(),
            "Description".to_string(),
        );
        req.scope = ScopeLevel::V1;
        // Reference a non-existent requirement
        req.dependencies = vec!["NONEXISTENT-99".to_string()];

        doc.add(req);

        let roadmap = RoadmapDoc::new("v1");
        let result = verify_plans(&doc, &roadmap);

        assert!(result.stats.orphaned_dependencies > 0);
    }

    // ============================================================================
    // Conversion Tests
    // ============================================================================

    #[test]
    fn test_convert_to_ralph_prd() {
        let mut doc = RequirementsDoc::new();

        let mut req = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "User Login".to_string(),
            "Users can log into the system".to_string(),
        );
        req.scope = ScopeLevel::V1;
        req.acceptance_criteria = vec![
            "Users see a login form".to_string(),
            "Invalid credentials show error".to_string(),
        ];
        doc.add(req);

        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Authentication".to_string(),
            description: "Implement auth".to_string(),
            requirement_ids: vec!["CORE-01".to_string()],
            effort_summary: "L".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let options = ConversionOptions {
            branch: "feature/auth".to_string(),
            include_v2: false,
            source_chat_id: Some("chat-123".to_string()),
            custom_title: Some("Auth Feature".to_string()),
            custom_description: None,
        };

        let result = convert_to_ralph_prd(
            &doc,
            &roadmap,
            Some("Auth Feature"),
            Some("Implement user authentication"),
            &options,
        );

        assert_eq!(result.story_count, 1);
        assert!(result.skipped.is_empty());
        assert_eq!(result.prd.title, "Auth Feature");
        assert_eq!(result.prd.branch, "feature/auth");
    }

    #[test]
    fn test_conversion_skips_out_of_scope() {
        let mut doc = RequirementsDoc::new();

        let mut v1_req = Requirement::new(
            "CORE-01".to_string(),
            RequirementCategory::Core,
            "V1 Feature".to_string(),
            "Included".to_string(),
        );
        v1_req.scope = ScopeLevel::V1;

        let mut oos_req = Requirement::new(
            "CORE-02".to_string(),
            RequirementCategory::Core,
            "OOS Feature".to_string(),
            "Excluded".to_string(),
        );
        oos_req.scope = ScopeLevel::OutOfScope;

        doc.add(v1_req);
        doc.add(oos_req);

        let mut roadmap = RoadmapDoc::new("v1");
        roadmap.add_phase(RoadmapPhase {
            number: 1,
            title: "Phase 1".to_string(),
            description: "V1 features".to_string(),
            requirement_ids: vec!["CORE-01".to_string(), "CORE-02".to_string()],
            effort_summary: "M".to_string(),
            prerequisites: vec![],
            milestone: None,
        });

        let options = ConversionOptions {
            branch: "main".to_string(),
            ..Default::default()
        };

        let result = convert_to_ralph_prd(&doc, &roadmap, None, None, &options);

        assert_eq!(result.story_count, 1);
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(result.skipped[0].requirement_id, "CORE-02");
    }

    // ============================================================================
    // Config Tests
    // ============================================================================

    #[test]
    fn test_gsd_config_defaults() {
        let config = GsdConfig::default();

        assert_eq!(config.max_parallel_research, 4);
        assert_eq!(config.research_timeout_secs, 300);
        assert!(!config.auto_advance);
        assert_eq!(config.min_context_items, 3);
        assert!(config.include_codebase_analysis);
    }

    #[test]
    fn test_research_agent_type_output_filename() {
        assert_eq!(
            ResearchAgentType::Architecture.output_filename(),
            "architecture.md"
        );
        assert_eq!(
            ResearchAgentType::Codebase.output_filename(),
            "codebase.md"
        );
        assert_eq!(
            ResearchAgentType::BestPractices.output_filename(),
            "best_practices.md"
        );
        assert_eq!(ResearchAgentType::Risks.output_filename(), "risks.md");
    }

    #[test]
    fn test_requirement_category_prefix() {
        assert_eq!(RequirementCategory::Core.prefix(), "CORE");
        assert_eq!(RequirementCategory::Ui.prefix(), "UI");
        assert_eq!(RequirementCategory::Data.prefix(), "DATA");
        assert_eq!(RequirementCategory::Integration.prefix(), "INT");
        assert_eq!(RequirementCategory::Security.prefix(), "SEC");
    }

    // ============================================================================
    // Multi-Session Isolation Test
    // ============================================================================

    #[test]
    fn test_multi_session_isolation() {
        let temp_dir = create_test_project();

        // Create two sessions
        init_planning_session(temp_dir.path(), "session-a").unwrap();
        init_planning_session(temp_dir.path(), "session-b").unwrap();

        // Save different states to each
        let mut state_a = GsdWorkflowState::new("session-a".to_string());
        state_a.current_phase = GsdPhase::Research;

        let mut state_b = GsdWorkflowState::new("session-b".to_string());
        state_b.current_phase = GsdPhase::Verification;

        save_workflow_state(temp_dir.path(), "session-a", &state_a).unwrap();
        save_workflow_state(temp_dir.path(), "session-b", &state_b).unwrap();

        // Load and verify isolation
        let loaded_a = load_workflow_state(temp_dir.path(), "session-a").unwrap();
        let loaded_b = load_workflow_state(temp_dir.path(), "session-b").unwrap();

        assert_eq!(loaded_a.current_phase, GsdPhase::Research);
        assert_eq!(loaded_b.current_phase, GsdPhase::Verification);
    }
}
