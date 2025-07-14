import SearchIcon from '../../icons/SearchIcon';

export default function SearchBar({ searchTerm, setSearchTerm }) {
  return (
    <div className="search-bar">
      <SearchIcon />
      <input
        type="text"
        placeholder="Поиск"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );
}
