import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PRDImport } from '../PRDImport'
import { useTaskStore } from '@/stores/taskStore'

// Mock the store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: vi.fn(),
}))

// Mock FileReader for tests
let mockFileContent = ''

class MockFileReader {
  onload: ((event: any) => void) | null = null

  readAsText(file: Blob) {
    // Simulate async file reading
    setTimeout(() => {
      if (this.onload) {
        this.onload({ target: { result: mockFileContent } })
      }
    }, 0)
  }
}

global.FileReader = MockFileReader as any

describe('PRDImport', () => {
  const mockImportPRD = vi.fn()
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useTaskStore as any).mockReturnValue({
      importPRD: mockImportPRD,
      loading: false,
      error: null,
    })
  })

  it('renders import dialog when open', () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    expect(screen.getByText('Import PRD')).toBeInTheDocument()
    expect(
      screen.getByText(/Import tasks from a Product Requirements Document/)
    ).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <PRDImport
        open={false}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    expect(screen.queryByText('Import PRD')).not.toBeInTheDocument()
  })

  it('handles file selection', async () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const file = new File(['test content'], 'test.json', { type: 'application/json' })
    const input = screen.getByLabelText(/choose a file/i) as HTMLInputElement

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('test.json')).toBeInTheDocument()
    })
  })

  it('auto-detects JSON format from file extension', async () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const file = new File(['{"title": "test"}'], 'test.json', { type: 'application/json' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    })

    fireEvent.change(input)

    await waitFor(() => {
      const formatSelect = screen.getByLabelText(/format/i) as HTMLSelectElement
      expect(formatSelect.value).toBe('json')
    })
  })

  it('auto-detects YAML format from file extension', async () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const file = new File(['title: test'], 'test.yaml', { type: 'text/yaml' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    })

    fireEvent.change(input)

    await waitFor(() => {
      const formatSelect = screen.getByLabelText(/format/i) as HTMLSelectElement
      expect(formatSelect.value).toBe('yaml')
    })
  })

  it('auto-detects Markdown format from file extension', async () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const file = new File(['# Test'], 'test.md', { type: 'text/markdown' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    })

    fireEvent.change(input)

    await waitFor(() => {
      const formatSelect = screen.getByLabelText(/format/i) as HTMLSelectElement
      expect(formatSelect.value).toBe('markdown')
    })
  })

  it('displays file preview', async () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const fileContent = 'This is test PRD content'
    mockFileContent = fileContent
    const file = new File([fileContent], 'test.md', { type: 'text/markdown' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    })

    fireEvent.change(input)

    await waitFor(() => {
      expect(screen.getByText(/This is test PRD content/)).toBeInTheDocument()
    })
  })

  it('calls importPRD when Import button is clicked', async () => {
    mockImportPRD.mockResolvedValue(undefined)

    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const fileContent = '{"title": "Test", "tasks": []}'
    mockFileContent = fileContent
    const file = new File([fileContent], 'test.json', { type: 'application/json' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    })

    fireEvent.change(input)

    // Wait for filename to appear
    await waitFor(() => {
      expect(screen.getByText('test.json')).toBeInTheDocument()
    })

    // Wait a bit for FileReader to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    const importButton = screen.getByText('Import Tasks')
    fireEvent.click(importButton)

    await waitFor(() => {
      expect(mockImportPRD).toHaveBeenCalledWith(
        'session-1',
        fileContent,
        'json'
      )
    })
  })

  it('closes dialog after successful import', async () => {
    mockImportPRD.mockResolvedValue(undefined)

    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    mockFileContent = 'test content'
    const file = new File(['test content'], 'test.json', { type: 'application/json' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    })

    fireEvent.change(input)

    // Wait for file to be loaded
    await waitFor(() => {
      expect(screen.getByText('test.json')).toBeInTheDocument()
    })

    // Wait for FileReader to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    const importButton = screen.getByText('Import Tasks')
    fireEvent.click(importButton)

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    }, { timeout: 2000 })
  })

  it('displays error message on import failure', () => {
    ;(useTaskStore as any).mockReturnValue({
      importPRD: mockImportPRD,
      loading: false,
      error: 'Failed to parse PRD',
    })

    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    expect(screen.getByText('Failed to parse PRD')).toBeInTheDocument()
  })

  it('disables import button when no file is selected', () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const importButton = screen.getByText('Import Tasks')
    expect(importButton).toBeDisabled()
  })

  it('shows loading state during import', () => {
    ;(useTaskStore as any).mockReturnValue({
      importPRD: mockImportPRD,
      loading: true,
      error: null,
    })

    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    expect(screen.getByText('Importing...')).toBeInTheDocument()
  })

  it('closes dialog when Cancel button is clicked', () => {
    render(
      <PRDImport
        open={true}
        onOpenChange={mockOnOpenChange}
        sessionId="session-1"
      />
    )

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  describe('file validation', () => {
    it('shows error for invalid file type', async () => {
      render(
        <PRDImport
          open={true}
          onOpenChange={mockOnOpenChange}
          sessionId="session-1"
        />
      )

      const file = new File(['test content'], 'test.exe', { type: 'application/x-msdownload' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText(/Invalid file type/)).toBeInTheDocument()
      })
    })

    it('shows error for file exceeding size limit', async () => {
      render(
        <PRDImport
          open={true}
          onOpenChange={mockOnOpenChange}
          sessionId="session-1"
        />
      )

      // Create a file object with a mocked size property (6MB)
      const file = new File(['test'], 'large.json', { type: 'application/json' })
      Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText(/File is too large/)).toBeInTheDocument()
      })
    })

    it('shows error for empty file', async () => {
      render(
        <PRDImport
          open={true}
          onOpenChange={mockOnOpenChange}
          sessionId="session-1"
        />
      )

      // Create an empty file
      const file = new File([], 'empty.json', { type: 'application/json' })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText(/File is empty/)).toBeInTheDocument()
      })
    })

    it('shows error for file with only whitespace', async () => {
      render(
        <PRDImport
          open={true}
          onOpenChange={mockOnOpenChange}
          sessionId="session-1"
        />
      )

      mockFileContent = '   \n\t  '
      const file = new File(['   \n\t  '], 'whitespace.json', { type: 'application/json' })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText(/empty or contains only whitespace/)).toBeInTheDocument()
      })
    })

    it('accepts valid .txt file', async () => {
      render(
        <PRDImport
          open={true}
          onOpenChange={mockOnOpenChange}
          sessionId="session-1"
        />
      )

      mockFileContent = 'This is a valid text file'
      const file = new File([mockFileContent], 'valid.txt', { type: 'text/plain' })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      Object.defineProperty(input, 'files', {
        value: [file],
        writable: false,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText('valid.txt')).toBeInTheDocument()
      })

      // Wait for FileReader to complete
      await new Promise(resolve => setTimeout(resolve, 50))

      // Should not show validation error
      expect(screen.queryByText(/Invalid file type/)).not.toBeInTheDocument()
      expect(screen.queryByText(/File is too large/)).not.toBeInTheDocument()
      expect(screen.queryByText(/File is empty/)).not.toBeInTheDocument()
    })

    it('clears validation error when dialog is closed', async () => {
      render(
        <PRDImport
          open={true}
          onOpenChange={mockOnOpenChange}
          sessionId="session-1"
        />
      )

      // First, trigger a validation error
      const invalidFile = new File(['test'], 'test.exe', { type: 'application/x-msdownload' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      Object.defineProperty(input, 'files', {
        value: [invalidFile],
        writable: false,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText(/Invalid file type/)).toBeInTheDocument()
      })

      // Close the dialog
      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('clears previous validation error when selecting new file', async () => {
      render(
        <PRDImport
          open={true}
          onOpenChange={mockOnOpenChange}
          sessionId="session-1"
        />
      )

      // First, trigger a validation error with invalid file
      const invalidFile = new File(['test'], 'test.exe', { type: 'application/x-msdownload' })
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      Object.defineProperty(input, 'files', {
        value: [invalidFile],
        configurable: true,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText(/Invalid file type/)).toBeInTheDocument()
      })

      // Now select a valid file
      mockFileContent = 'valid content'
      const validFile = new File([mockFileContent], 'valid.json', { type: 'application/json' })

      // Redefine the property with configurable: true to allow subsequent redefinition
      Object.defineProperty(input, 'files', {
        value: [validFile],
        configurable: true,
      })

      fireEvent.change(input)

      await waitFor(() => {
        expect(screen.getByText('valid.json')).toBeInTheDocument()
      })

      // Wait for FileReader to complete
      await new Promise(resolve => setTimeout(resolve, 50))

      // Error should be cleared
      expect(screen.queryByText(/Invalid file type/)).not.toBeInTheDocument()
    })
  })
})
