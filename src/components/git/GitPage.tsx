import React, { useState } from "react";
import { CommitInfo } from "../../lib/git-api";
import { BranchManager } from "./BranchManager";
import { CommitHistory } from "./CommitHistory";
import { DiffViewer } from "./DiffViewer";
import { WorktreeManager } from "./WorktreeManager";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FolderOpen } from "lucide-react";

export const GitPage: React.FC = () => {
  const [repoPath, setRepoPath] = useState("");
  const [activeRepoPath, setActiveRepoPath] = useState("");
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [diffFromCommit, setDiffFromCommit] = useState<string | undefined>(
    undefined
  );
  const [diffToCommit, setDiffToCommit] = useState<string | undefined>(
    undefined
  );

  const handleSetRepo = () => {
    if (repoPath.trim()) {
      setActiveRepoPath(repoPath.trim());
    }
  };

  const handleCommitSelect = (commit: CommitInfo) => {
    setSelectedCommit(commit);
    // Set diff to show changes from this commit's parent to this commit
    if (commit.parent_ids.length > 0) {
      setDiffFromCommit(commit.parent_ids[0]);
      setDiffToCommit(commit.id);
    } else {
      // First commit, show all files as new
      setDiffFromCommit(undefined);
      setDiffToCommit(commit.id);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Git Management</h1>

        {/* Repository Path Input */}
        <div className="flex space-x-2 mb-6">
          <div className="flex-1 relative">
            <FolderOpen className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Enter repository path (e.g., /path/to/repo)"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleSetRepo();
                }
              }}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSetRepo} disabled={!repoPath.trim()}>
            Load Repository
          </Button>
        </div>

        {activeRepoPath && (
          <div className="bg-blue-50 border border-blue-200 px-4 py-2 rounded">
            <p className="text-sm text-blue-800">
              <strong>Active Repository:</strong>{" "}
              <code className="bg-blue-100 px-2 py-1 rounded">
                {activeRepoPath}
              </code>
            </p>
          </div>
        )}
      </div>

      {activeRepoPath && (
        <Tabs defaultValue="branches" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="commits">Commits</TabsTrigger>
            <TabsTrigger value="diff">Diff</TabsTrigger>
            <TabsTrigger value="worktrees">Worktrees</TabsTrigger>
          </TabsList>

          <TabsContent value="branches" className="space-y-6">
            <BranchManager repoPath={activeRepoPath} />
          </TabsContent>

          <TabsContent value="commits" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CommitHistory
                repoPath={activeRepoPath}
                onCommitSelect={handleCommitSelect}
              />

              <div>
                {selectedCommit ? (
                  <div className="border rounded-lg p-6 bg-white">
                    <h3 className="text-lg font-bold mb-4">Commit Details</h3>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-gray-600">
                          ID:
                        </span>
                        <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                          {selectedCommit.id}
                        </code>
                      </div>

                      <div>
                        <span className="text-sm font-medium text-gray-600">
                          Author:
                        </span>
                        <span className="ml-2">{selectedCommit.author}</span>
                        <span className="text-gray-500 ml-1">
                          ({selectedCommit.email})
                        </span>
                      </div>

                      <div>
                        <span className="text-sm font-medium text-gray-600">
                          Date:
                        </span>
                        <span className="ml-2">
                          {new Date(
                            selectedCommit.timestamp * 1000
                          ).toLocaleString()}
                        </span>
                      </div>

                      <div>
                        <span className="text-sm font-medium text-gray-600 block mb-1">
                          Message:
                        </span>
                        <pre className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">
                          {selectedCommit.message}
                        </pre>
                      </div>

                      {selectedCommit.parent_ids.length > 0 && (
                        <div>
                          <span className="text-sm font-medium text-gray-600 block mb-1">
                            Parent{selectedCommit.parent_ids.length > 1 ? "s" : ""}:
                          </span>
                          {selectedCommit.parent_ids.map((parentId, i) => (
                            <code
                              key={i}
                              className="block bg-gray-100 px-2 py-1 rounded text-sm font-mono mb-1"
                            >
                              {parentId}
                            </code>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-6 bg-gray-50 text-center text-gray-500">
                    Select a commit to view details
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="diff" className="space-y-6">
            <DiffViewer
              repoPath={activeRepoPath}
              fromCommit={diffFromCommit}
              toCommit={diffToCommit}
              showWorkingDiff={!diffFromCommit && !diffToCommit}
            />
          </TabsContent>

          <TabsContent value="worktrees" className="space-y-6">
            <WorktreeManager repoPath={activeRepoPath} />
          </TabsContent>
        </Tabs>
      )}

      {!activeRepoPath && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">Enter a repository path above to get started</p>
        </div>
      )}
    </div>
  );
};
