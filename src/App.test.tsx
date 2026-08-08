import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock the IndexedDB database to prevent API missing errors in test environment
vi.mock('./db/database', () => {
  const mockTable = {
    count: () => Promise.resolve(0),
    toArray: () => Promise.resolve([]),
    orderBy: () => ({
      toArray: () => Promise.resolve([])
    }),
    where: () => ({
      anyOf: () => ({
        count: () => Promise.resolve(0)
      })
    }),
    get: () => Promise.resolve(null),
    put: () => Promise.resolve(),
    update: () => Promise.resolve()
  };

  return {
    db: {
      cart: mockTable,
      playlists: mockTable,
      history: mockTable,
      settings: mockTable
    },
    initializeSettings: vi.fn()
  };
});

describe('App', () => {
  it('renders successfully', () => {
    render(<App />);
    // Check if the sidebar brand title is rendered
    const brandElements = screen.getAllByText(/MPMusic/i);
    expect(brandElements.length).toBeGreaterThan(0);
  });
});
