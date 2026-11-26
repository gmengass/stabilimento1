import { SearchForm } from "./search-form";

interface Props {
  date: string;
  areaId?: number;
  query?: string;
}

/** The search page's form: always open, with the search being shown. */
export function BookingSearch(props: Props) {
  return <SearchForm {...props} />;
}
