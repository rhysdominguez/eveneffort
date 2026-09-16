"use client";
import {
  ALL_LOCATIONS,
  type ContinentValue,
  type FilterOption,
  type Locatable,
  type LocationFilter,
  continentOptions,
  countryOptions,
  isFiltered,
  regionNouns,
  regionOptions,
  selectContinent,
  selectCountry,
  selectRegion,
} from "@/lib/locationFilter";
import { SelectChevron } from "@/components/SelectChevron";

/**
 * The continent -> country -> state/region cascade, as a control.
 *
 * Shared by the race calendar and the course rankings so the two lists narrow
 * the same way, read the same way and are learned once: a visitor who has
 * filtered the calendar to Texas already knows how to filter the rankings.
 * The cascade itself lives in @/lib/locationFilter, DOM-free and tested there.
 *
 * `rows` is whatever list the caller is filtering, UNFILTERED at this level:
 * the option counts are computed from it, and feeding the already-filtered
 * list back in would collapse every select to the one option still selected.
 */
export function LocationFilterBar({
  idPrefix,
  rows,
  filter,
  onChange,
}: {
  /** Distinguishes the three `<label for>` pairs when two bars share a page. */
  idPrefix: string;
  rows: Locatable[];
  filter: LocationFilter;
  onChange: (next: LocationFilter) => void;
}) {
  const continents = continentOptions(rows);
  const countries = countryOptions(rows, filter.continent);
  const regions = regionOptions(rows, filter.countryCode);

  return (
    // Deliberately native `<select>`s rather than the combobox CourseSearch
    // uses: these are short, closed lists of known names, and a native select
    // is the one control that is already keyboard-, screen-reader- and
    // mobile-correct without a line of our code.
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        id={`${idPrefix}-continent`}
        label="Continent"
        allLabel="All continents"
        value={filter.continent}
        options={continents}
        onChange={(value) =>
          onChange(selectContinent(value as ContinentValue | null))
        }
      />
      <FilterSelect
        id={`${idPrefix}-country`}
        label="Country"
        allLabel="All countries"
        value={filter.countryCode}
        options={countries}
        onChange={(value) => onChange(selectCountry(filter, value))}
      />
      {/* Only rendered where a country is big enough to need it — see
          `regionOptions`. */}
      {regions && (
        <FilterSelect
          id={`${idPrefix}-region`}
          label={regionNouns(filter.countryCode).label}
          allLabel={regionNouns(filter.countryCode).allLabel}
          value={filter.regionCode}
          options={regions}
          onChange={(value) => onChange(selectRegion(filter, value))}
        />
      )}
      {isFiltered(filter) && (
        <button
          type="button"
          onClick={() => onChange(ALL_LOCATIONS)}
          className="h-10 rounded-[var(--radius-control)] px-3 text-sm font-medium text-[var(--color-text-secondary)] underline-offset-4 transition-colors hover:text-[var(--color-text-primary)] hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/**
 * One level of the location cascade. The empty string is the "no filter"
 * option value, because a `<select>` value is always a string — null would
 * make it uncontrolled and React would warn.
 *
 * Counts are in the option text rather than beside the label so they narrow
 * with the level above: after choosing Europe, "Italy (42)" is Italy's races,
 * and the number never has to be re-read against a different scope.
 */
function FilterSelect({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string | null;
  options: FilterOption[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]"
      >
        {label}
      </label>
      {/* The chevron is ours, not the OS's: `appearance-none` drops the
          platform arrow so these read as the same dropdown as the race-year
          picker on the calculator. */}
      <div className="relative">
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-10 w-full min-w-[10rem] appearance-none rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-3 pr-9 text-sm text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-text-tertiary)] focus:border-[var(--color-border-focus)] focus:outline-none"
        >
          <option value="">{allLabel}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
        <SelectChevron className="right-3" />
      </div>
    </div>
  );
}
