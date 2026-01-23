use ralph_ui_lib::plugins::{Plugin, PluginRegistry, PluginType};

#[test]
fn test_plugin_registration() {
    let mut registry = PluginRegistry::new();

    let plugin = Plugin {
        id: "test-plugin".to_string(),
        name: "Test Plugin".to_string(),
        description: "A test plugin".to_string(),
        version: "1.0.0".to_string(),
        plugin_type: PluginType::Agent,
        enabled: true,
        author: Some("Tester".to_string()),
        repository: None,
    };

    // Test registration
    assert!(registry.register(plugin.clone()).is_ok());

    // Test duplicate registration
    assert!(registry.register(plugin.clone()).is_err());

    // Test retrieval
    let retrieved = registry.get("test-plugin");
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().name, "Test Plugin");

    // Test listing
    let plugins = registry.list();
    assert_eq!(plugins.len(), 1);

    // Test unregistration
    let removed = registry.unregister("test-plugin");
    assert!(removed.is_some());
    assert_eq!(removed.unwrap().id, "test-plugin");
    assert!(registry.get("test-plugin").is_none());
}

#[test]
fn test_plugin_enable_disable() {
    let mut registry = PluginRegistry::new();

    let plugin = Plugin {
        id: "test-plugin".to_string(),
        name: "Test Plugin".to_string(),
        description: "A test plugin".to_string(),
        version: "1.0.0".to_string(),
        plugin_type: PluginType::Core,
        enabled: true,
        author: None,
        repository: None,
    };

    registry.register(plugin).unwrap();

    // Disable
    assert!(registry.set_enabled("test-plugin", false).is_ok());
    assert!(!registry.get("test-plugin").unwrap().enabled);

    // Enable
    assert!(registry.set_enabled("test-plugin", true).is_ok());
    assert!(registry.get("test-plugin").unwrap().enabled);

    // Non-existent
    assert!(registry.set_enabled("non-existent", false).is_err());
}
