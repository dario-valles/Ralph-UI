//! Dependency graph with Kahn's algorithm for topological sorting
//!
//! Provides cycle detection and execution ordering for requirements.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

/// Error types for dependency validation
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DependencyValidationError {
    /// A cycle was detected in the dependency graph
    CycleDetected(Vec<String>),
    /// A dependency references a non-existent requirement
    MissingDependency { from: String, to: String },
    /// Self-referential dependency
    SelfDependency(String),
}

impl std::fmt::Display for DependencyValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DependencyValidationError::CycleDetected(cycle) => {
                write!(f, "Cycle detected: {}", cycle.join(" → "))
            }
            DependencyValidationError::MissingDependency { from, to } => {
                write!(f, "Requirement '{}' depends on non-existent '{}'", from, to)
            }
            DependencyValidationError::SelfDependency(id) => {
                write!(f, "Requirement '{}' cannot depend on itself", id)
            }
        }
    }
}

impl std::error::Error for DependencyValidationError {}

/// Dependency graph for requirement ordering
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyGraph {
    /// Maps requirement ID to list of requirements it depends on
    pub depends_on: HashMap<String, Vec<String>>,
    /// Maps requirement ID to list of requirements blocked by it
    pub blocks: HashMap<String, Vec<String>>,
}

impl DependencyGraph {
    /// Create a new empty dependency graph
    pub fn new() -> Self {
        Self {
            depends_on: HashMap::new(),
            blocks: HashMap::new(),
        }
    }

    /// Add a dependency: `req_id` depends on `depends_on_id`
    pub fn add_dependency(&mut self, req_id: &str, depends_on_id: &str) -> Result<(), String> {
        // Check for self-dependency
        if req_id == depends_on_id {
            return Err(format!("Requirement '{}' cannot depend on itself", req_id));
        }

        // Add to depends_on map
        self.depends_on
            .entry(req_id.to_string())
            .or_default()
            .push(depends_on_id.to_string());

        // Add to blocks map (reverse relationship)
        self.blocks
            .entry(depends_on_id.to_string())
            .or_default()
            .push(req_id.to_string());

        Ok(())
    }

    /// Remove a dependency
    pub fn remove_dependency(&mut self, req_id: &str, depends_on_id: &str) {
        if let Some(deps) = self.depends_on.get_mut(req_id) {
            deps.retain(|d| d != depends_on_id);
        }

        if let Some(blocked) = self.blocks.get_mut(depends_on_id) {
            blocked.retain(|b| b != req_id);
        }
    }

    /// Remove all dependencies for a requirement
    pub fn remove_requirement(&mut self, req_id: &str) {
        // Remove from depends_on
        if let Some(deps) = self.depends_on.remove(req_id) {
            // Remove from blocks of each dependency
            for dep in deps {
                if let Some(blocked) = self.blocks.get_mut(&dep) {
                    blocked.retain(|b| b != req_id);
                }
            }
        }

        // Remove from blocks
        if let Some(blocked) = self.blocks.remove(req_id) {
            // Remove from depends_on of each blocked requirement
            for blocked_id in blocked {
                if let Some(deps) = self.depends_on.get_mut(&blocked_id) {
                    deps.retain(|d| d != req_id);
                }
            }
        }
    }

    /// Get all requirements that `req_id` depends on
    pub fn get_dependencies(&self, req_id: &str) -> Vec<&String> {
        self.depends_on
            .get(req_id)
            .map(|deps| deps.iter().collect())
            .unwrap_or_default()
    }

    /// Get all requirements blocked by `req_id`
    pub fn get_blocked_by(&self, req_id: &str) -> Vec<&String> {
        self.blocks
            .get(req_id)
            .map(|blocked| blocked.iter().collect())
            .unwrap_or_default()
    }

    /// Validate the graph for cycles using DFS
    pub fn validate(&self) -> Result<(), DependencyValidationError> {
        let all_nodes: HashSet<&String> =
            self.depends_on.keys().chain(self.blocks.keys()).collect();

        // Track visited nodes and nodes in current path
        let mut visited: HashSet<&String> = HashSet::new();
        let mut in_path: HashSet<&String> = HashSet::new();
        let mut path: Vec<&String> = Vec::new();

        for node in &all_nodes {
            if !visited.contains(node) {
                if let Some(cycle) =
                    self.dfs_cycle_detect(node, &mut visited, &mut in_path, &mut path)
                {
                    return Err(DependencyValidationError::CycleDetected(
                        cycle.into_iter().map(|s| s.to_string()).collect(),
                    ));
                }
            }
        }

        Ok(())
    }

    /// DFS helper for cycle detection
    fn dfs_cycle_detect<'a>(
        &'a self,
        node: &'a String,
        visited: &mut HashSet<&'a String>,
        in_path: &mut HashSet<&'a String>,
        path: &mut Vec<&'a String>,
    ) -> Option<Vec<&'a String>> {
        visited.insert(node);
        in_path.insert(node);
        path.push(node);

        if let Some(deps) = self.depends_on.get(node) {
            for dep in deps {
                if in_path.contains(dep) {
                    // Found a cycle - extract the cycle from the path
                    let cycle_start = path.iter().position(|&n| n == dep).unwrap();
                    let mut cycle: Vec<&String> = path[cycle_start..].to_vec();
                    cycle.push(dep); // Complete the cycle
                    return Some(cycle);
                }

                if !visited.contains(dep) {
                    if let Some(cycle) = self.dfs_cycle_detect(dep, visited, in_path, path) {
                        return Some(cycle);
                    }
                }
            }
        }

        in_path.remove(node);
        path.pop();
        None
    }

    /// Get execution order using Kahn's algorithm (topological sort)
    pub fn execution_order(&self) -> Result<Vec<String>, String> {
        // First validate the graph
        if let Err(e) = self.validate() {
            return Err(e.to_string());
        }

        // Collect all nodes
        let all_nodes: HashSet<String> = self
            .depends_on
            .keys()
            .chain(self.blocks.keys())
            .cloned()
            .collect();

        if all_nodes.is_empty() {
            return Ok(Vec::new());
        }

        // Calculate in-degrees (number of dependencies)
        let mut in_degree: HashMap<String, usize> = HashMap::new();
        for node in &all_nodes {
            in_degree.insert(node.clone(), 0);
        }

        for (node, deps) in &self.depends_on {
            in_degree.insert(node.clone(), deps.len());
        }

        // Start with nodes that have no dependencies (in-degree = 0)
        let mut queue: VecDeque<String> = in_degree
            .iter()
            .filter(|(_, &degree)| degree == 0)
            .map(|(node, _)| node.clone())
            .collect();

        let mut result: Vec<String> = Vec::new();

        while let Some(node) = queue.pop_front() {
            result.push(node.clone());

            // Reduce in-degree of blocked requirements
            if let Some(blocked) = self.blocks.get(&node) {
                for blocked_node in blocked {
                    if let Some(degree) = in_degree.get_mut(blocked_node) {
                        *degree = degree.saturating_sub(1);
                        if *degree == 0 {
                            queue.push_back(blocked_node.clone());
                        }
                    }
                }
            }
        }

        // If not all nodes are in result, there's a cycle (shouldn't happen after validate)
        if result.len() != all_nodes.len() {
            return Err("Cycle detected in dependency graph".to_string());
        }

        Ok(result)
    }

    /// Get requirements that are ready to execute (all dependencies completed)
    pub fn get_ready(&self, completed: &HashSet<String>) -> Vec<String> {
        let mut ready = Vec::new();

        // Get all nodes that have dependencies
        let nodes_with_deps: HashSet<String> = self.depends_on.keys().cloned().collect();

        // A node is ready if all its dependencies are completed
        for (node, deps) in &self.depends_on {
            if !completed.contains(node) {
                let all_deps_done = deps.iter().all(|d| completed.contains(d));
                if all_deps_done {
                    ready.push(node.clone());
                }
            }
        }

        // Also include nodes with no dependencies that aren't completed
        let all_nodes: HashSet<String> = self
            .depends_on
            .keys()
            .chain(self.blocks.keys())
            .cloned()
            .collect();

        for node in &all_nodes {
            if !completed.contains(node) && !nodes_with_deps.contains(node) {
                ready.push(node.clone());
            }
        }

        ready
    }

    /// Check if adding a dependency would create a cycle
    pub fn would_create_cycle(&self, from: &str, to: &str) -> bool {
        // Check if there's already a path from `to` to `from`
        // (which would mean adding from→to creates a cycle)
        let mut visited: HashSet<&str> = HashSet::new();
        let mut queue: VecDeque<&str> = VecDeque::new();
        queue.push_back(to);

        while let Some(current) = queue.pop_front() {
            if current == from {
                return true;
            }

            if visited.contains(current) {
                continue;
            }
            visited.insert(current);

            if let Some(deps) = self.depends_on.get(current) {
                for dep in deps {
                    queue.push_back(dep.as_str());
                }
            }
        }

        false
    }

    /// Get statistics about the dependency graph
    pub fn stats(&self) -> DependencyStats {
        let all_nodes: HashSet<&String> =
            self.depends_on.keys().chain(self.blocks.keys()).collect();

        let total_dependencies: usize = self.depends_on.values().map(|v| v.len()).sum();

        let max_depth = self.calculate_max_depth();

        let root_nodes: Vec<String> = all_nodes
            .iter()
            .filter(|n| !self.depends_on.contains_key(**n) || self.depends_on[**n].is_empty())
            .map(|n| (*n).clone())
            .collect();

        let leaf_nodes: Vec<String> = all_nodes
            .iter()
            .filter(|n| !self.blocks.contains_key(**n) || self.blocks[**n].is_empty())
            .map(|n| (*n).clone())
            .collect();

        DependencyStats {
            total_nodes: all_nodes.len(),
            total_dependencies,
            max_depth,
            root_nodes,
            leaf_nodes,
        }
    }

    /// Calculate the maximum depth of the dependency graph
    fn calculate_max_depth(&self) -> usize {
        let mut max_depth = 0;
        let mut memo: HashMap<&String, usize> = HashMap::new();

        let all_nodes: HashSet<&String> =
            self.depends_on.keys().chain(self.blocks.keys()).collect();

        for node in &all_nodes {
            let depth = self.node_depth(node, &mut memo);
            max_depth = max_depth.max(depth);
        }

        max_depth
    }

    /// Calculate the depth of a single node (memoized)
    fn node_depth<'a>(&'a self, node: &'a String, memo: &mut HashMap<&'a String, usize>) -> usize {
        if let Some(&depth) = memo.get(node) {
            return depth;
        }

        let deps = self.depends_on.get(node);
        let depth = match deps {
            None => 0,
            Some(deps) if deps.is_empty() => 0,
            Some(deps) => {
                1 + deps
                    .iter()
                    .map(|d| self.node_depth(d, memo))
                    .max()
                    .unwrap_or(0)
            }
        };

        memo.insert(node, depth);
        depth
    }
}

/// Statistics about a dependency graph
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStats {
    /// Total number of nodes
    pub total_nodes: usize,
    /// Total number of dependency edges
    pub total_dependencies: usize,
    /// Maximum depth of the dependency chain
    pub max_depth: usize,
    /// Nodes with no dependencies (can start immediately)
    pub root_nodes: Vec<String>,
    /// Nodes that nothing depends on (end points)
    pub leaf_nodes: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_dependency() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("CORE-02", "CORE-01").unwrap();

        assert_eq!(
            graph.get_dependencies("CORE-02"),
            vec![&"CORE-01".to_string()]
        );
        assert_eq!(
            graph.get_blocked_by("CORE-01"),
            vec![&"CORE-02".to_string()]
        );
    }

    #[test]
    fn test_self_dependency() {
        let mut graph = DependencyGraph::new();
        let result = graph.add_dependency("CORE-01", "CORE-01");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot depend on itself"));
    }

    #[test]
    fn test_cycle_detection() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("A", "B").unwrap();
        graph.add_dependency("B", "C").unwrap();
        graph.add_dependency("C", "A").unwrap(); // Creates cycle A → B → C → A

        let result = graph.validate();
        assert!(matches!(
            result,
            Err(DependencyValidationError::CycleDetected(_))
        ));
    }

    #[test]
    fn test_no_cycle() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("C", "B").unwrap();
        graph.add_dependency("B", "A").unwrap();
        graph.add_dependency("C", "A").unwrap(); // Diamond, no cycle

        assert!(graph.validate().is_ok());
    }

    #[test]
    fn test_execution_order() {
        let mut graph = DependencyGraph::new();
        // C depends on B, B depends on A
        // Expected order: A, B, C
        graph.add_dependency("C", "B").unwrap();
        graph.add_dependency("B", "A").unwrap();

        let order = graph.execution_order().unwrap();

        // A should come before B, B should come before C
        let pos_a = order.iter().position(|x| x == "A").unwrap();
        let pos_b = order.iter().position(|x| x == "B").unwrap();
        let pos_c = order.iter().position(|x| x == "C").unwrap();

        assert!(pos_a < pos_b);
        assert!(pos_b < pos_c);
    }

    #[test]
    fn test_get_ready() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("C", "B").unwrap();
        graph.add_dependency("B", "A").unwrap();

        // Initially, only A is ready
        let completed: HashSet<String> = HashSet::new();
        let ready = graph.get_ready(&completed);
        assert_eq!(ready, vec!["A"]);

        // After A is done, B is ready
        let mut completed: HashSet<String> = HashSet::new();
        completed.insert("A".to_string());
        let ready = graph.get_ready(&completed);
        assert_eq!(ready, vec!["B"]);

        // After A and B are done, C is ready
        completed.insert("B".to_string());
        let ready = graph.get_ready(&completed);
        assert_eq!(ready, vec!["C"]);
    }

    #[test]
    fn test_would_create_cycle() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("B", "A").unwrap();
        graph.add_dependency("C", "B").unwrap();

        // Adding A → C would create a cycle
        assert!(graph.would_create_cycle("A", "C"));

        // Adding D → A would not create a cycle
        assert!(!graph.would_create_cycle("D", "A"));
    }

    #[test]
    fn test_remove_dependency() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("B", "A").unwrap();
        graph.add_dependency("C", "A").unwrap();

        graph.remove_dependency("B", "A");

        assert!(graph.get_dependencies("B").is_empty());
        assert_eq!(graph.get_blocked_by("A"), vec![&"C".to_string()]);
    }

    #[test]
    fn test_stats() {
        let mut graph = DependencyGraph::new();
        graph.add_dependency("B", "A").unwrap();
        graph.add_dependency("C", "B").unwrap();
        graph.add_dependency("D", "B").unwrap();

        let stats = graph.stats();
        assert_eq!(stats.total_nodes, 4);
        assert_eq!(stats.total_dependencies, 3);
        assert_eq!(stats.max_depth, 2);
        assert!(stats.root_nodes.contains(&"A".to_string()));
        assert!(stats.leaf_nodes.contains(&"C".to_string()));
        assert!(stats.leaf_nodes.contains(&"D".to_string()));
    }
}
