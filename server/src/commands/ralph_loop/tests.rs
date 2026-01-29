//! Tests for Ralph Loop commands

use super::prd_ops::{is_story_header, parse_markdown_stories_with_acceptance, parse_story_header};

// -------------------------------------------------------------------------
// parse_story_header tests
// -------------------------------------------------------------------------

#[test]
fn test_parse_story_header_markdown_h4() {
    let line = "#### US-1.1: User Login Feature";
    let result = parse_story_header(line);
    assert!(result.is_some());
    let (id, title) = result.unwrap();
    assert_eq!(id, "US-1.1");
    assert_eq!(title, "User Login Feature");
}

#[test]
fn test_parse_story_header_markdown_h3() {
    let line = "### US-2.3: Dashboard Analytics";
    let result = parse_story_header(line);
    assert!(result.is_some());
    let (id, title) = result.unwrap();
    assert_eq!(id, "US-2.3");
    assert_eq!(title, "Dashboard Analytics");
}

#[test]
fn test_parse_story_header_bold_format() {
    let line = "**US-1.1: User Login Feature**";
    let result = parse_story_header(line);
    assert!(result.is_some());
    let (id, title) = result.unwrap();
    assert_eq!(id, "US-1.1");
    assert_eq!(title, "User Login Feature");
}

#[test]
fn test_parse_story_header_bold_colon_outside() {
    // Format where colon is outside the bold: **US-1.1:** Title
    let line = "**US-1.1:** User Login Feature";
    let result = parse_story_header(line);
    assert!(result.is_some());
    let (id, title) = result.unwrap();
    assert_eq!(id, "US-1.1");
    assert_eq!(title, "User Login Feature");
}

#[test]
fn test_parse_story_header_task_format() {
    let line = "#### T-3.2: Implement API Endpoint";
    let result = parse_story_header(line);
    assert!(result.is_some());
    let (id, title) = result.unwrap();
    assert_eq!(id, "T-3.2");
    assert_eq!(title, "Implement API Endpoint");
}

#[test]
fn test_parse_story_header_bold_task_format() {
    let line = "**T-3.2: Implement API Endpoint**";
    let result = parse_story_header(line);
    assert!(result.is_some());
    let (id, title) = result.unwrap();
    assert_eq!(id, "T-3.2");
    assert_eq!(title, "Implement API Endpoint");
}

#[test]
fn test_parse_story_header_non_story_line() {
    let line = "This is just a regular line of text";
    let result = parse_story_header(line);
    assert!(result.is_none());
}

#[test]
fn test_parse_story_header_section_header() {
    let line = "## Overview";
    let result = parse_story_header(line);
    assert!(result.is_none());
}

// -------------------------------------------------------------------------
// is_story_header tests
// -------------------------------------------------------------------------

#[test]
fn test_is_story_header_markdown() {
    assert!(is_story_header("#### US-1.1: Title"));
    assert!(is_story_header("### US-2.1: Title"));
    assert!(is_story_header("#### T-1.1: Title"));
}

#[test]
fn test_is_story_header_bold() {
    assert!(is_story_header("**US-1.1: Title**"));
    assert!(is_story_header("**US-1.1:** Title"));
    assert!(is_story_header("**T-1.1: Title**"));
}

#[test]
fn test_is_story_header_false_cases() {
    assert!(!is_story_header("## Overview"));
    assert!(!is_story_header("Regular text"));
    assert!(!is_story_header("**Bold but not a story**"));
}

// -------------------------------------------------------------------------
// parse_markdown_stories_with_acceptance tests
// -------------------------------------------------------------------------

#[test]
fn test_parse_stories_markdown_format() {
    let content = r#"
# PRD Document

## User Stories

#### US-1.1: User Login

**Acceptance Criteria:**
- User can enter email and password
- Form validates inputs
- Shows error on invalid credentials

#### US-1.2: User Registration

**Acceptance Criteria:**
- User can create new account
- Email verification required
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-1.1");
    assert_eq!(stories[0].title, "User Login");
    assert!(stories[0].acceptance.contains("User can enter email"));

    assert_eq!(stories[1].id, "US-1.2");
    assert_eq!(stories[1].title, "User Registration");
    assert!(stories[1]
        .acceptance
        .contains("User can create new account"));
}

#[test]
fn test_parse_stories_bold_format() {
    let content = r#"
# PRD Document

## User Stories

**US-1.1: User Login**

**Acceptance Criteria:**
- User can enter email and password
- Form validates inputs
- Shows error on invalid credentials

**US-1.2: User Registration**

**Acceptance Criteria:**
- User can create new account
- Email verification required
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-1.1");
    assert_eq!(stories[0].title, "User Login");
    assert!(stories[0].acceptance.contains("User can enter email"));

    assert_eq!(stories[1].id, "US-1.2");
    assert_eq!(stories[1].title, "User Registration");
}

#[test]
fn test_parse_stories_bold_colon_outside_format() {
    let content = r#"
# PRD Document

**US-1.1:** User Login

**Acceptance Criteria:**
- User can enter email and password
- Form validates inputs

**US-2.1:** Dashboard View

**Acceptance Criteria:**
- Shows user statistics
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-1.1");
    assert_eq!(stories[0].title, "User Login");

    assert_eq!(stories[1].id, "US-2.1");
    assert_eq!(stories[1].title, "Dashboard View");
}

#[test]
fn test_parse_stories_mixed_format() {
    let content = r#"
# PRD

#### US-1.1: Login (Header Format)

**Acceptance Criteria:**
- Criteria 1

**US-2.1: Dashboard (Bold Format)**

**Acceptance Criteria:**
- Criteria 2
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-1.1");
    assert_eq!(stories[1].id, "US-2.1");
}

#[test]
fn test_parse_stories_no_acceptance_criteria() {
    let content = r#"
#### US-1.1: Feature Without Criteria

Just some description text.

#### US-1.2: Another Feature
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    // Should have fallback acceptance criteria
    assert!(stories[0].acceptance.starts_with("Implement:"));
    assert!(stories[1].acceptance.starts_with("Implement:"));
}

#[test]
fn test_parse_stories_deduplicates() {
    let content = r#"
#### US-1.1: Duplicate Story

**Acceptance Criteria:**
- First version

#### US-1.1: Duplicate Story Again

**Acceptance Criteria:**
- Second version
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    // Should only have one US-1.1
    assert_eq!(stories.len(), 1);
    assert_eq!(stories[0].id, "US-1.1");
}

#[test]
fn test_parse_stories_fallback_to_headers() {
    // When no US- patterns are found, fall back to generic headers
    let content = r#"
## Overview
This is an overview.

## Login Feature
Implement login.

## Dashboard
Show analytics.
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    // Should find "Login Feature" and "Dashboard" (Overview is skipped)
    assert_eq!(stories.len(), 2);
    assert_eq!(stories[0].id, "task-1");
    assert_eq!(stories[0].title, "Login Feature");
    assert_eq!(stories[1].id, "task-2");
    assert_eq!(stories[1].title, "Dashboard");
}

#[test]
fn test_parse_stories_spanish_acceptance_criteria() {
    let content = r#"
# PRD Document

## User Stories

### US-01: Ver tiempo restante de la reunión

**Criterios de Aceptación:**
- El timer se muestra en una esquina del video
- Muestra el tiempo en formato MM:SS o HH:MM:SS
- Es semi-transparente y no intrusivo

### US-02: Controlar timer

**Criterios de Aceptación:**
- Se puede pausar el timer
- Se puede reanudar el timer
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-01");
    assert_eq!(stories[0].title, "Ver tiempo restante de la reunión");
    assert!(stories[0].acceptance.contains("El timer se muestra"));
    assert!(stories[0].acceptance.contains("Muestra el tiempo"));
    assert!(stories[0].acceptance.contains("Es semi-transparente"));

    assert_eq!(stories[1].id, "US-02");
    assert_eq!(stories[1].title, "Controlar timer");
    assert!(stories[1].acceptance.contains("Se puede pausar"));
    assert!(stories[1].acceptance.contains("Se puede reanudar"));
}

#[test]
fn test_parse_stories_french_acceptance_criteria() {
    let content = r#"
# Document PRD

## Histoires d'utilisateurs

### US-01: Afficher le minuteur

**Critères d'acceptation:**
- Le minuteur s'affiche dans un coin
- Format MM:SS ou HH:MM:SS
- Transparence appropriée

### US-02: Contrôler le minuteur

**Critères d'acceptation:**
- Peut être mis en pause
- Peut être repris
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-01");
    assert_eq!(stories[0].title, "Afficher le minuteur");
    assert!(stories[0].acceptance.contains("Le minuteur s'affiche"));
    assert!(stories[0].acceptance.contains("Format MM:SS"));

    assert_eq!(stories[1].id, "US-02");
    assert!(stories[1].acceptance.contains("Peut être mis en pause"));
}

#[test]
fn test_parse_stories_german_acceptance_criteria() {
    let content = r#"
# PRD Dokument

## Benutzergeschichten

### US-01: Timer anzeigen

**Akzeptanzkriterien:**
- Timer wird in der Ecke angezeigt
- Format MM:SS oder HH:MM:SS
- Halbdurchsichtig und nicht aufdringlich

### US-02: Timer steuern

**Akzeptanzkriterien:**
- Timer kann pausiert werden
- Timer kann fortgesetzt werden
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-01");
    assert!(stories[0].acceptance.contains("Timer wird in der Ecke"));
    assert!(stories[0].acceptance.contains("Format MM:SS"));

    assert_eq!(stories[1].id, "US-02");
    assert!(stories[1].acceptance.contains("Timer kann pausiert"));
}

#[test]
fn test_parse_stories_portuguese_acceptance_criteria() {
    let content = r#"
# Documento PRD

## Histórias do Usuário

### US-01: Exibir temporizador

**Critérios de aceitação:**
- Temporizador aparece no canto
- Formato MM:SS ou HH:MM:SS
- Semi-transparente e não intrusivo

### US-02: Controlar temporizador

**Critérios de aceitação:**
- Pode ser pausado
- Pode ser retomado
"#;

    let stories = parse_markdown_stories_with_acceptance(content);
    assert_eq!(stories.len(), 2);

    assert_eq!(stories[0].id, "US-01");
    assert!(stories[0].acceptance.contains("Temporizador aparece"));
    assert!(stories[0].acceptance.contains("Formato MM:SS"));

    assert_eq!(stories[1].id, "US-02");
    assert!(stories[1].acceptance.contains("Pode ser pausado"));
}
