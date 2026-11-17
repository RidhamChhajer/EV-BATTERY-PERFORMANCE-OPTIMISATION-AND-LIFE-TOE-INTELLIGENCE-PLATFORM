import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FIELD_BY_KEY } from '../lib/scenario'
import { FieldWithBadge } from './FieldWithBadge'

describe('FieldWithBadge', () => {
  it('shows the unit and source, with no assumption badge (T5.2-5)', () => {
    render(<FieldWithBadge meta={FIELD_BY_KEY.km_per_day} value={200} onChange={() => {}} />)
    expect(screen.queryByText('assumption')).not.toBeInTheDocument()
    expect(screen.getByText('km')).toBeInTheDocument()
    expect(screen.getByText('Bus type default')).toBeInTheDocument()
  })
  it('reports typed numbers and empty text, scaling percent fields', async () => {
    const onChange = vi.fn()
    render(<FieldWithBadge meta={FIELD_BY_KEY.threshold} value={0.8} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: /replace when health/i })
    expect(input).toHaveValue('80')
    await userEvent.clear(input); expect(onChange).toHaveBeenLastCalledWith(null)
    await userEvent.type(input, '75'); expect(onChange).toHaveBeenLastCalledWith(0.75)
  })
  it('shows an inline error and links it to the input (T5.2-2)', () => {
    render(<FieldWithBadge meta={FIELD_BY_KEY.km_per_day} value={-5} error="Must be above 0" onChange={() => {}} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Must be above 0')
  })
  it('prefers the local message but still shows a server message', () => {
    render(<FieldWithBadge meta={FIELD_BY_KEY.km_per_day} value={900} serverError="Input should be less than or equal to 700" onChange={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/less than or equal to 700/)
  })
  it('explains the field in plain words and the allowed range', async () => {
    render(<FieldWithBadge meta={FIELD_BY_KEY.soc_max_pct} value={100} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /about charge cap/i }))
    expect(screen.getByText(/gentler on the battery/)).toBeInTheDocument()
    expect(screen.getByText(/gentler on the battery/)).toHaveTextContent(/Allowed: 40 to 100/)
  })
  it('shows clock times for hour fields', () => {
    render(<FieldWithBadge meta={FIELD_BY_KEY.charge_start_hour} value={22.5} onChange={() => {}} />)
    expect(screen.getByText(/22:30/)).toBeInTheDocument()
  })
})
