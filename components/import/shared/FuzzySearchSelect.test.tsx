import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';
import FuzzySearchSelect from './FuzzySearchSelect';

function ControlledSelect() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <FuzzySearchSelect
      options={[
        { id: "MAAT Baby's", label: "MAAT Baby's" },
        { id: 'MAAT Kinderen', label: 'MAAT Kinderen' },
        { id: 'MAAT Tieners', label: 'MAAT Tieners' },
        { id: 'MAAT Volwassenen', label: 'MAAT Volwassenen' },
      ]}
      value={value}
      onChange={setValue}
      placeholder="Maat-attribuut..."
    />
  );
}

describe('FuzzySearchSelect', () => {
  it('allows selecting MAAT Kinderen from the portal menu', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);

    await user.click(screen.getByPlaceholderText('Maat-attribuut...'));
    await user.click(await screen.findByRole('option', { name: 'MAAT Kinderen' }));

    expect(screen.getByDisplayValue('MAAT Kinderen')).toBeInTheDocument();
  });
});
