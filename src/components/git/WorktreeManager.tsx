import React, { useEffect, useState } from "react";
import { WorktreeInfo, gitApi } from "../../lib/git-api";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { RefreshCw, FolderGit2, Plus, Trash2, Lock, AlertCircle } from "lucide-react";

interface WorktreeManagerProps {
  repoPath: string;
}

export const WorktreeManager: React.FC<WorktreeManagerProps> = ({
  repoPath,
}) => {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [newWorktreePath, setNewWorktreePath] = useState("");
  const [creating, setCreating] = useState(false);

  const loadWorktrees = async () => {
    setLoading(true);
    setError(null);

    try {
      const worktreeList = await gitApi.listWorktrees(repoPath);
      setWorktrees(worktreeList);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load worktrees"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      loadWorktrees();
    }
  }, [repoPath]);

  const handleCreateWorktree = async () => {
    if (!newBranchName.trim() || !newWorktreePath.trim()) return;

    setCreating(true);
    setError(null);

    try {
      await gitApi.createWorktree(
        repoPath,
        newBranchName.trim(),
        newWorktreePath.trim()
      );
      setNewBranchName("");
      setNewWorktreePath("");
      await loadWorktrees();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create worktree"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRemoveWorktree = async (name: string) => {
    if (!confirm(`Are you sure you want to remove worktree "${name}"?`)) {
      return;
    }

    setError(null);

    try {
      await gitApi.removeWorktree(repoPath, name);
      await loadWorktrees();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove worktree"
      );
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl font-bold">Worktrees</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={loadWorktrees}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4 flex items-center">
            <AlertCircle className="h-4 w-4 mr-2" />
            {error}
          </div>
        )}

        {/* Create Worktree Form */}
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-sm font-medium mb-3">Create New Worktree</h3>
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              disabled={creating}
            />
            <Input
              type="text"
              placeholder="Worktree path (e.g., /path/to/worktree)"
              value={newWorktreePath}
              onChange={(e) => setNewWorktreePath(e.target.value)}
              disabled={creating}
            />
            <Button
              onClick={handleCreateWorktree}
              disabled={
                !newBranchName.trim() || !newWorktreePath.trim() || creating
              }
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Worktree
            </Button>
          </div>
        </div>

        {/* Worktree List */}
        <div className="space-y-2">
          {loading && !worktrees.length && (
            <div className="text-center py-8 text-gray-500">
              Loading worktrees...
            </div>
          )}

          {!loading && worktrees.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No worktrees found
            </div>
          )}

          {worktrees.map((worktree) => (
            <div
              key={worktree.name}
              className="border rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <FolderGit2 className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium">{worktree.name}</span>
                      {worktree.is_locked && (
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Locked
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <p className="font-mono text-xs">{worktree.path}</p>
                      {worktree.branch && (
                        <p className="mt-1">
                          Branch:{" "}
                          <Badge variant="outline" className="ml-1">
                            {worktree.branch}
                          </Badge>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveWorktree(worktree.name)}
                  disabled={worktree.is_locked}
                >
                  <Trash2 className="h-3 w-3 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
