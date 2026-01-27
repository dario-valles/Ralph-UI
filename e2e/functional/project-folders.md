# Project Folder Organization Feature Test

## Test: Create folder and assign project during add

**Steps:**
1. Navigate to Mission Control
2. Click "Add Project" button
3. Browse to a project directory
4. Click "Folder" dropdown
5. Click "Create new folder..."
6. Enter folder name "Work Projects"
7. Click "Create" button
8. Verify the new folder appears in the dropdown
9. Click "Select Folder" to select the "Work Projects" folder
10. Click "Select This Folder"
11. Verify project is added with the folder assigned

**Expected Result:**
- Project appears in the project list
- Project is assigned to the "Work Projects" folder
- Folder shows project count of 1

## Test: Create folder without assigning (Uncategorized)

**Steps:**
1. Navigate to Mission Control
2. Click "Add Project" button
3. Browse to a project directory
4. Leave folder selection as "Uncategorized" (default)
5. Click "Select This Folder"

**Expected Result:**
- Project is added successfully
- Project is not assigned to any folder (folderId is null)

## Test: Assign existing project to folder

**Steps:**
1. Create a folder named "Personal Projects"
2. Add a new project and assign it to "Personal Projects"
3. Verify the project appears in the folder
4. (Future enhancement) Change project's folder through UI

**Expected Result:**
- Project is correctly assigned to the folder
- Folder displays accurate project count

## Test: Folder name validation

**Steps:**
1. Try to create a folder with empty name
2. Try to create a folder with only spaces
3. Try to create a folder with duplicate name (case-insensitive)

**Expected Result:**
- Empty/spaces names show validation error
- Duplicate name shows error: "Folder with this name already exists"

## Test: Migration from v1 to v2

**Steps:**
1. Stop the server
2. Edit `~/.ralph-ui/projects.json`
3. Set version to 1
4. Remove folders field if present
5. Start the server
6. Check logs for migration message

**Expected Result:**
- Server logs: "Migrating projects registry from v1 to v2..."
- Server logs: "Projects registry migration to v2 complete"
- File is updated to version 2
- Existing projects still accessible
- folders field exists (empty array)
- All projects have folderId field (null for existing projects)
