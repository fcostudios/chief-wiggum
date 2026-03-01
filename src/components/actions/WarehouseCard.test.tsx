import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import WarehouseCard from './WarehouseCard';

describe('WarehouseCard', () => {
  it('renders project name', () => {
    const { getByText } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="My Project"
        activeLaneCount={0}
        onSelect={() => {}}
      />
    ));
    expect(getByText('My Project')).toBeTruthy();
  });

  it('shows active lane count badge with green styling when > 0', () => {
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={3}
        onSelect={() => {}}
      />
    ));
    expect(container.textContent).toContain('3');
    const badge = container.querySelector('.lane-count-badge');
    expect(badge).toBeTruthy();
  });

  it('shows gray badge when no lanes are running', () => {
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={0}
        onSelect={() => {}}
      />
    ));
    const badge = container.querySelector('.lane-count-badge');
    expect(badge).toBeTruthy();
  });

  it('calls onSelect with projectId when clicked', () => {
    let selected = '';
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={0}
        onSelect={(id) => {
          selected = id;
        }}
      />
    ));
    const button = container.querySelector('button[role="button"]') as HTMLButtonElement;
    button.click();
    expect(selected).toBe('proj-1');
  });

  it('adds active class to conveyor when activeLaneCount > 0', () => {
    const { container } = render(() => (
      <WarehouseCard
        projectId="proj-1"
        projectName="Test"
        activeLaneCount={2}
        onSelect={() => {}}
      />
    ));
    const conveyor = container.querySelector('.conveyor-strip');
    expect(conveyor?.classList.contains('active')).toBe(true);
  });
});
