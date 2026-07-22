import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ValidationReport from './ValidationReport';
import type { ProductValidation } from './ValidationReport';

const allPassResults: ProductValidation[] = [
  {
    templateId: 100,
    productName: 'Test Product A',
    overallStatus: 'pass',
    results: [
      { field: 'name', status: 'pass', expected: 'Test Product A', actual: 'Test Product A', message: 'name matches' },
      { field: 'categ_id', status: 'pass', expected: '5', actual: '5', message: 'Internal category matches' },
      { field: 'brand', status: 'pass', expected: 'BrandX', actual: 'BrandX', message: 'Brand "BrandX" is set' },
    ],
  },
  {
    templateId: 101,
    productName: 'Test Product B',
    overallStatus: 'pass',
    results: [
      { field: 'name', status: 'pass', expected: 'Test Product B', actual: 'Test Product B', message: 'name matches' },
    ],
  },
];

const mixedResults: ProductValidation[] = [
  {
    templateId: 200,
    productName: 'Good Product',
    overallStatus: 'pass',
    results: [
      { field: 'name', status: 'pass', expected: 'Good Product', actual: 'Good Product', message: 'name matches' },
    ],
  },
  {
    templateId: 201,
    productName: 'Warn Product',
    overallStatus: 'warning',
    results: [
      { field: 'name', status: 'pass', expected: 'Warn Product', actual: 'Warn Product', message: 'name matches' },
      { field: 'variant_count', status: 'warning', expected: '4', actual: '3', message: 'Expected 4 variants, found 3' },
    ],
  },
  {
    templateId: 202,
    productName: 'Bad Product',
    overallStatus: 'fail',
    results: [
      { field: 'name', status: 'fail', expected: 'Bad Product', actual: 'Wrong Name', message: 'name mismatch' },
      { field: 'brand', status: 'fail', expected: 'BrandY', actual: 'No MERK attribute line', message: 'Brand attribute line is missing' },
    ],
  },
];

describe('ValidationReport', () => {
  it('renders summary cards with correct counts for all-pass results', () => {
    render(<ValidationReport results={allPassResults} />);

    const summary = screen.getByTestId('summary-cards');
    const counts = within(summary).getAllByText(/^\d+$/).map(el => el.textContent);
    expect(counts).toEqual(['2', '2', '0', '0']); // total, passed, warnings, failed
    expect(within(summary).getByText('Geslaagd')).toBeInTheDocument();
    expect(within(summary).getByText('Waarschuwingen')).toBeInTheDocument();
    expect(within(summary).getByText('Mislukt')).toBeInTheDocument();
  });

  it('renders summary counts correctly for mixed results', () => {
    render(<ValidationReport results={mixedResults} />);

    const summary = screen.getByTestId('summary-cards');
    const counts = within(summary).getAllByText(/^\d+$/);
    const countValues = counts.map(el => el.textContent);

    expect(countValues).toContain('3'); // total
    expect(countValues).toContain('1'); // passed, warnings, failed are all 1
  });

  it('renders all product cards', () => {
    render(<ValidationReport results={mixedResults} />);

    expect(screen.getByText('Good Product')).toBeInTheDocument();
    expect(screen.getByText('Warn Product')).toBeInTheDocument();
    expect(screen.getByText('Bad Product')).toBeInTheDocument();
  });

  it('shows field details when a product card is expanded', async () => {
    const user = userEvent.setup();
    render(<ValidationReport results={mixedResults} />);

    const badProductButton = screen.getByRole('button', { name: /Bad Product/i });
    await user.click(badProductButton);

    expect(screen.getByText('Productnaam')).toBeInTheDocument();
    expect(screen.getByText('Merk')).toBeInTheDocument();
    expect(screen.getByText('Wrong Name')).toBeInTheDocument();
  });

  it('collapses product details when clicked again', async () => {
    const user = userEvent.setup();
    render(<ValidationReport results={allPassResults} />);

    const button = screen.getByRole('button', { name: /Test Product A/i });

    await user.click(button);
    expect(screen.getByTestId('field-table')).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByTestId('field-table')).not.toBeInTheDocument();
  });

  it('renders the report heading', () => {
    render(<ValidationReport results={allPassResults} />);
    expect(screen.getByText('Validatierapport')).toBeInTheDocument();
  });

  it('shows revalidate button when onRevalidate is provided', () => {
    render(<ValidationReport results={allPassResults} onRevalidate={() => {}} />);
    expect(screen.getByText('Hervalideren')).toBeInTheDocument();
  });

  it('does not show revalidate button when onRevalidate is not provided', () => {
    render(<ValidationReport results={allPassResults} />);
    expect(screen.queryByText('Hervalideren')).not.toBeInTheDocument();
  });

  it('disables revalidate button when isLoading is true', () => {
    render(<ValidationReport results={allPassResults} onRevalidate={() => {}} isLoading />);
    expect(screen.getByText('Bezig...')).toBeDisabled();
  });
});
