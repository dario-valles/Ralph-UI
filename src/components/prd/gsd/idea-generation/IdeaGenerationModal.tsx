/**
 * Idea Generation Modal Component
 *
 * Main modal that provides tab-based interface for idea generation:
 * - Generate: Blank page and vague notion modes
 * - Explore: Domain exploration mode
 * - Validate: Feasibility and market analysis
 *
 * Responsive: full-screen on mobile, modal on desktop
 */
import { useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { BlankPageMode } from './BlankPageMode'
import { VagueNotionMode } from './VagueNotionMode'
import { ExploreSpaceMode } from './ExploreSpaceMode'
import { ValidateMode } from './ValidateMode'
import { IdeaComparisonView } from './IdeaComparisonView'
import type { IdeaGenMode, ValidatedIdea } from '@/types/gsd'
import { X, Sparkles, Shuffle, Compass, CheckCircle2, GitCompare, ArrowRight } from 'lucide-react'

interface IdeaGenerationModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback to close the modal */
  onOpenChange: (open: boolean) => void
  /** Callback when an idea is selected */
  onSelectIdea: (idea: import('@/types/gsd').GeneratedIdea) => void
  /** Project type */
  projectType: import('@/types/gsd').ProjectType
  /** Current questioning context */
  currentContext: import('@/types/gsd').QuestioningContext
}

export function IdeaGenerationModal({
  open,
  onOpenChange,
  onSelectIdea,
  projectType,
  currentContext,
}: IdeaGenerationModalProps) {
  const {
    ideaGeneration: { mode, ideas, selectedIdeaId, variationDimensions, isGenerating, isValidating, error },
    setIdeaGenMode,
    generateIdeas,
    generateVariations,
    exploreSpace,
    validateIdea,
    analyzeMarket,
    selectIdea,
    clearIdeaGeneration,
    clearError,
  } = usePRDChatStore()

  // Get selected idea
  const selectedIdea = ideas.find((i) => i.base.id === selectedIdeaId) || null

  // Handle mode change
  const handleModeChange = useCallback(
    (newMode: IdeaGenMode) => {
      setIdeaGenMode(newMode)
    },
    [setIdeaGenMode]
  )

  // Handle idea selection from any mode
  const handleSelectIdea = useCallback(
    (idea: ValidatedIdea) => {
      selectIdea(idea.base.id)
      handleModeChange('validate')
    },
    [selectIdea, handleModeChange]
  )

  // Handle generate ideas from blank page
  const handleGenerateIdeas = useCallback(async () => {
    clearError()
    await generateIdeas(projectType, currentContext)
  }, [projectType, currentContext, generateIdeas, clearError])

  // Handle generate variations
  const handleGenerateVariations = useCallback(
    async (context: import('@/types/gsd').QuestioningContext, dimensions: string[]) => {
      clearError()
      await generateVariations(projectType, context, dimensions as import('@/types/gsd').VariationDimension[])
    },
    [projectType, generateVariations, clearError]
  )

  // Handle explore space
  const handleExploreSpace = useCallback(
    async (domain: string, interests: string[]) => {
      clearError()
      await exploreSpace(domain, interests)
    },
    [exploreSpace, clearError]
  )

  // Handle validate feasibility
  const handleValidateFeasibility = useCallback(
    async (idea: ValidatedIdea) => {
      clearError()
      await validateIdea(idea, projectType)
    },
    [projectType, validateIdea, clearError]
  )

  // Handle analyze market
  const handleAnalyzeMarket = useCallback(
    async (idea: ValidatedIdea) => {
      clearError()
      await analyzeMarket(idea)
    },
    [analyzeMarket, clearError]
  )

  // Handle use simplified MVP
  const handleUseSimplifiedMvp = useCallback(
    (idea: ValidatedIdea) => {
      if (idea.feasibility?.simplifiedMvp) {
        const simplifiedIdea: ValidatedIdea = {
          base: idea.feasibility.simplifiedMvp,
          feasibility: idea.feasibility,
          market: idea.market,
        }
        selectIdea(simplifiedIdea.base.id)
      }
    },
    [selectIdea]
  )

  // Handle confirm selection
  const handleConfirm = useCallback(() => {
    if (selectedIdea) {
      onSelectIdea(selectedIdea.base)
      clearIdeaGeneration()
      onOpenChange(false)
    }
  }, [selectedIdea, onSelectIdea, clearIdeaGeneration, onOpenChange])

  // Handle compare view
  const handleCompare = useCallback(() => {
    handleModeChange('compare')
  }, [handleModeChange])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      clearIdeaGeneration()
    }
  }, [open, clearIdeaGeneration])

  // Determine initial tab based on mode
  const getInitialTab = useCallback(() => {
    switch (mode) {
      case 'blank_page':
      case 'vague_notion':
        return 'generate'
      case 'explore_space':
        return 'explore'
      case 'validate':
        return 'validate'
      case 'compare':
        return 'compare'
      default:
        return 'generate'
    }
  }, [mode])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                AI-Powered Idea Generation
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Generate, explore, and validate project ideas with AI assistance
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Main content with tabs */}
        <Tabs defaultValue={getInitialTab()} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
              <TabsTrigger value="generate" className="gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Generate</span>
              </TabsTrigger>
              <TabsTrigger value="explore" className="gap-2">
                <Compass className="h-4 w-4" />
                <span className="hidden sm:inline">Explore</span>
              </TabsTrigger>
              <TabsTrigger
                value="validate"
                className="gap-2"
                disabled={!selectedIdea}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">Validate</span>
              </TabsTrigger>
              <TabsTrigger
                value="compare"
                className="gap-2"
                disabled={ideas.length < 2}
              >
                <GitCompare className="h-4 w-4" />
                <span className="hidden sm:inline">Compare</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden p-6">
            <TabsContent value="generate" className="h-full m-0 space-y-4">
              <Tabs className="h-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger
                    value="blank-page"
                    className="gap-2"
                    onClick={() => setIdeaGenMode('blank_page')}
                  >
                    <Sparkles className="h-4 w-4" />
                    From Interests
                  </TabsTrigger>
                  <TabsTrigger
                    value="vague-notion"
                    className="gap-2"
                    onClick={() => setIdeaGenMode('vague_notion')}
                  >
                    <Shuffle className="h-4 w-4" />
                    Variations
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="blank-page" className="h-full m-0">
                  <BlankPageMode
                    projectType={projectType}
                    ideas={ideas}
                    isGenerating={isGenerating}
                    onGenerate={handleGenerateIdeas}
                    onSelectIdea={handleSelectIdea}
                    selectedIdeaId={selectedIdeaId}
                    error={error}
                  />
                </TabsContent>

                <TabsContent value="vague-notion" className="h-full m-0">
                  <VagueNotionMode
                    context={currentContext}
                    ideas={ideas}
                    isGenerating={isGenerating}
                    variationDimensions={variationDimensions}
                    onGenerateVariations={handleGenerateVariations}
                    onSelectIdea={handleSelectIdea}
                    selectedIdeaId={selectedIdeaId}
                    error={error}
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="explore" className="h-full m-0">
              <ExploreSpaceMode
                ideas={ideas}
                isGenerating={isGenerating}
                onExploreSpace={handleExploreSpace}
                onSelectIdea={handleSelectIdea}
                selectedIdeaId={selectedIdeaId}
                error={error}
              />
            </TabsContent>

            <TabsContent value="validate" className="h-full m-0">
              <ValidateMode
                idea={selectedIdea}
                isValidating={isValidating}
                onValidateFeasibility={handleValidateFeasibility}
                onAnalyzeMarket={handleAnalyzeMarket}
                onUseSimplifiedMvp={handleUseSimplifiedMvp}
                onConfirm={handleConfirm}
                error={error}
              />
            </TabsContent>

            <TabsContent value="compare" className="h-full m-0">
              <IdeaComparisonView
                ideas={ideas.slice(0, 3)}
                onSelectIdea={handleSelectIdea}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        {ideas.length > 0 && mode !== 'validate' && mode !== 'compare' && (
          <div className="px-6 py-4 border-t bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {ideas.length} idea{ideas.length !== 1 ? 's' : ''} generated
              </div>
              <div className="flex gap-2">
                {ideas.length >= 2 && (
                  <Button variant="outline" onClick={handleCompare} className="gap-2">
                    <GitCompare className="h-4 w-4" />
                    Compare Ideas
                  </Button>
                )}
                {selectedIdea && (
                  <Button onClick={() => handleModeChange('validate')} className="gap-2">
                    Validate Selected Idea
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
