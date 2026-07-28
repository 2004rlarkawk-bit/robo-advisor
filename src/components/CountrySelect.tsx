import { useEffect, useState } from 'react';
import { COUNTRY_OPTIONS, isPresetCountry, normalizeCountryValue, OTHER_COUNTRY_VALUE } from '../constants/countries';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  directInputClassName?: string;
  emptyLabel?: string;
  directInputPlaceholder?: string;
  required?: boolean;
}

export default function CountrySelect({
  value,
  onChange,
  className = '',
  directInputClassName = className,
  emptyLabel = 'Select a country',
  directInputPlaceholder = 'Enter country name in English',
  required = false,
}: Props) {
  const normalizedValue = normalizeCountryValue(value);
  const usesDirectInput = Boolean(normalizedValue) && !isPresetCountry(normalizedValue);
  const [directMode, setDirectMode] = useState(usesDirectInput);

  useEffect(() => {
    if (usesDirectInput) setDirectMode(true);
  }, [usesDirectInput]);

  return (
    <>
      <select
        className={className}
        required={required}
        value={directMode ? OTHER_COUNTRY_VALUE : normalizedValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDirectMode(nextValue === OTHER_COUNTRY_VALUE);
          onChange(nextValue === OTHER_COUNTRY_VALUE ? '' : nextValue);
        }}
      >
        <option value="">{emptyLabel}</option>
        {COUNTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        <option value={OTHER_COUNTRY_VALUE}>Other (Direct input)</option>
      </select>
      {directMode && (
        <input
          className={directInputClassName}
          value={normalizedValue}
          placeholder={directInputPlaceholder}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </>
  );
}
