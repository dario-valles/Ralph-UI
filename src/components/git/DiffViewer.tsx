import React, { useEffect, useState } from "react";
import { DiffInfo, FileDiff, gitApi, gitHelpers } from "../../lib/git-api";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { RefreshCw, FileText, Plus, Minus, AlertCircle } from "lucide-react";

interface DiffViewerProps {
  repoPath: string;
  fromCommit?: string;
  toCommit?: string;
  showWorkingDiff?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  repoPath,
  fromCommit,
  toCommit,
  showWorkingDiff = false,
}) => {
  const [diff, setDiff] = useState<DiffInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const loadDiff = async () => {
    setLoading(true);
    setError(null);

    try {
      const diffData = showWorkingDiff
        ? await gitApi.getWorkingDiff(repoPath)
        : await gitApi.getDiff(repoPath, fromCommit, toCommit);

      setDiff(diffData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (repoPath) {
      loadDiff();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Load on mount and prop changes only
  }, [repoPath, fromCommit, toCommit, showWorkingDiff]);

  const toggleFileExpansion = (filePath: string) => {
    setExpandedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  const getFileStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();

    if (statusLower === "added") {
      return (
        <Badge className="bg-green-500">
          <Plus className="h-3 w-3 mr-1" />
          Added
        </Badge>
      );
    } else if (statusLower === "deleted") {
      return (
        <Badge className="bg-red-500">
          <Minus className="h-3 w-3 mr-1" />
          Deleted
        </Badge>
      );
    } else if (statusLower === "modified") {
      return <Badge className="bg-yellow-500">Modified</Badge>;
    } else if (statusLower === "renamed") {
      return <Badge className="bg-blue-500">Renamed</Badge>;
    } else {
      return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFilePath = (file: FileDiff): string => {
    return file.new_path || file.old_path || "unknown";
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-xl font-bold mb-2">Diff Viewer</CardTitle>
          {diff && (
            <div className="text-sm text-gray-600">
              {gitHelpers.getDiffSummary(diff)}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadDiff}
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

        {loading && !diff && (
          <div className="text-center py-8 text-gray-500">Loading diff...</div>
        )}

        {!loading && !error && diff && diff.files.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No changes found
          </div>
        )}

        {diff && diff.files.length > 0 && (
          <div className="space-y-2">
            {/* Summary Stats */}
            <div className="flex items-center space-x-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="font-medium">
                  {diff.files_changed} file{diff.files_changed !== 1 ? "s" : ""}
                </span>
              </div>
              {diff.insertions > 0 && (
                <div className="flex items-center space-x-1 text-green-600">
                  <Plus className="h-4 w-4" />
                  <span className="font-medium">{diff.insertions}</span>
                </div>
              )}
              {diff.deletions > 0 && (
                <div className="flex items-center space-x-1 text-red-600">
                  <Minus className="h-4 w-4" />
                  <span className="font-medium">{diff.deletions}</span>
                </div>
              )}
            </div>

            {/* File List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {diff.files.map((file, index) => {
                const filePath = getFilePath(file);
                const isExpanded = expandedFiles.has(filePath);

                return (
                  <div
                    key={index}
                    className="border rounded-lg overflow-hidden"
                  >
                    <div
                      className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                      onClick={() => toggleFileExpansion(filePath)}
                    >
                      <div className="flex items-center space-x-3">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium font-mono text-sm">
                              {filePath}
                            </span>
                            {getFileStatusBadge(file.status)}
                          </div>
                          {file.old_path &&
                            file.new_path &&
                            file.old_path !== file.new_path && (
                              <div className="text-xs text-gray-500 mt-1">
                                {file.old_path} → {file.new_path}
                              </div>
                            )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 text-sm">
                        {file.insertions > 0 && (
                          <span className="text-green-600">
                            +{file.insertions}
                          </span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-600">
                            -{file.deletions}
                          </span>
                        )}
                        <span className="text-gray-400">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 bg-white border-t">
                        <div className="text-sm text-gray-600">
                          <p>
                            <strong>Status:</strong> {file.status}
                          </p>
                          {file.old_path && (
                            <p>
                              <strong>Old Path:</strong>{" "}
                              <code className="bg-gray-100 px-2 py-1 rounded">
                                {file.old_path}
                              </code>
                            </p>
                          )}
                          {file.new_path && (
                            <p>
                              <strong>New Path:</strong>{" "}
                              <code className="bg-gray-100 px-2 py-1 rounded">
                                {file.new_path}
                              </code>
                            </p>
                          )}
                          <p>
                            <strong>Changes:</strong>{" "}
                            <span className="text-green-600">
                              +{file.insertions}
                            </span>{" "}
                            <span className="text-red-600">
                              -{file.deletions}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
