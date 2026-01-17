import React, { useEffect, useState } from "react";
import { BranchInfo, gitApi, gitHelpers } from "../../lib/git-api";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  RefreshCw,
  GitBranch,
  Plus,
  Trash2,
  Check,
  AlertCircle,
} from "lucide-react";

interface BranchManagerProps {
  repoPath: string;
  onBranchChange?: (branch: BranchInfo) => void;
}

export const BranchManager: React.FC<BranchManagerProps> = ({
  repoPath,
  onBranchChange,
}) => {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [currentBranch, setCurrentBranch] = useState<BranchInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);

  const loadBranches = async () => {
    setLoading(true);
    setError(null);

    try {
      const [branchList, current] = await Promise.all([
        gitApi.listBranches(repoPath),
        gitApi.getCurrentBranch(repoPath),
      ]);

      setBranches(branchList);
      setCurrentBranch(current);

      if (onBranchChange) {
        onBranchChange(current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      loadBranches();
    }
  }, [repoPath]);

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    setCreatingBranch(true);
    setError(null);

    try {
      await gitApi.createBranch(repoPath, newBranchName.trim(), false);
      setNewBranchName("");
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create branch");
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    setError(null);

    try {
      await gitApi.checkoutBranch(repoPath, branchName);
      await loadBranches();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to checkout branch"
      );
    }
  };

  const handleDeleteBranch = async (branchName: string) => {
    if (currentBranch?.name === branchName) {
      setError("Cannot delete the current branch");
      return;
    }

    if (!confirm(`Are you sure you want to delete branch "${branchName}"?`)) {
      return;
    }

    setError(null);

    try {
      await gitApi.deleteBranch(repoPath, branchName);
      await loadBranches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete branch");
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-xl font-bold">Branches</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={loadBranches}
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

        {/* Create Branch Form */}
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-sm font-medium mb-3">Create New Branch</h3>
          <div className="flex space-x-2">
            <Input
              type="text"
              placeholder="Branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateBranch();
                }
              }}
              disabled={creatingBranch}
            />
            <Button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || creatingBranch}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create
            </Button>
          </div>
        </div>

        {/* Current Branch */}
        {currentBranch && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Check className="h-5 w-5 text-green-600" />
                <span className="font-medium">Current Branch:</span>
                <Badge className="bg-green-600">{currentBranch.name}</Badge>
              </div>
              <span className="text-sm text-gray-600 font-mono">
                {currentBranch.commit_id.substring(0, 7)}
              </span>
            </div>
            {currentBranch.upstream && (
              <div className="mt-2 text-sm text-gray-600">
                Tracking: {currentBranch.upstream}
              </div>
            )}
          </div>
        )}

        {/* Branch List */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium mb-2">All Branches</h3>

          {loading && !branches.length && (
            <div className="text-center py-8 text-gray-500">
              Loading branches...
            </div>
          )}

          {!loading && branches.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No branches found
            </div>
          )}

          {branches.map((branch) => (
            <div
              key={branch.name}
              className={`
                border rounded-lg p-3 flex items-center justify-between
                ${
                  branch.is_head
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:bg-gray-50"
                }
              `}
            >
              <div className="flex items-center space-x-3">
                <GitBranch
                  className={`h-4 w-4 ${
                    branch.is_head ? "text-green-600" : "text-gray-500"
                  }`}
                />
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">{branch.name}</span>
                    {branch.is_head && (
                      <Badge variant="secondary" className="text-xs">
                        HEAD
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {branch.commit_id.substring(0, 7)}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {!branch.is_head && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCheckoutBranch(branch.name)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Checkout
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteBranch(branch.name)}
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
