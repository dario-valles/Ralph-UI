import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlashCommandMenu } from '../SlashCommandMenu'
import { SLASH_COMMANDS } from '@/lib/prd-chat-commands'

describe('SlashCommandMenu', () => {
  const mockOnSelect = vi.fn()
  const commands = SLASH_COMMANDS

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock scrollIntoView since it's not available in JSDOM
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders nothing when not open', () => {
    const { container } = render(
      <SlashCommandMenu
        isOpen={false}
        query=""
        selectedIndex={0}
        onSelect={mockOnSelect}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders commands when open', () => {
    render(
      <SlashCommandMenu
        isOpen={true}
        query=""
        selectedIndex={0}
        onSelect={mockOnSelect}
      />
    )
    // Should render at least one command
    expect(screen.getByText(commands[0].label)).toBeInTheDocument()
    expect(screen.getByText('Commands')).toBeInTheDocument()
  })

  it('filters commands based on query', () => {
    const query = 'epic'
    render(
      <SlashCommandMenu
        isOpen={true}
        query={query}
        selectedIndex={0}
        onSelect={mockOnSelect}
      />
    )
    
    // Should show Epic command
    expect(screen.getByText('Epic')).toBeInTheDocument()
    
    // Should NOT show Critique command (assuming it doesn't match 'epic')
    expect(screen.queryByText('Critique')).not.toBeInTheDocument()
  })

  it('highlights selected item based on selectedIndex', () => {
    render(
      <SlashCommandMenu
        isOpen={true}
        query=""
        selectedIndex={1}
        onSelect={mockOnSelect}
      />
    )
    
    const buttons = screen.getAllByRole('button')
    // buttons[0] is the first command. 
    // We expect the second command (index 1) to be highlighted.
    // The highlighted class includes 'bg-emerald-500/10'
    
    expect(buttons[1]).toHaveClass('bg-emerald-500/10')
    expect(buttons[0]).not.toHaveClass('bg-emerald-500/10')
  })

  it('calls onSelect when an item is clicked', () => {
    render(
      <SlashCommandMenu
        isOpen={true}
        query=""
        selectedIndex={0}
        onSelect={mockOnSelect}
      />
    )
    
    const buttons = screen.getAllByRole('button')
    buttons[0].click()
    
    expect(mockOnSelect).toHaveBeenCalledWith(expect.objectContaining({
      label: commands[0].label
    }))
  })
})
