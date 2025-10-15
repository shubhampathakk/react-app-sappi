import React, { useState, useEffect, useCallback } from 'react';
import { HelpCircle, Settings, ArrowRight, Plus, Trash2, Edit } from 'lucide-react';

const App = () => {
  const [view, setView] = useState('query'); // 'query' or 'admin'
  const [config, setConfig] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [columns, setColumns] = useState([]);
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [filters, setFilters] = useState([]);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Admin state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState(null);

  const MOCK_COLUMNS = {
    "Sales_Report": ["product_id", "sale_date", "amount", "region", "customer_id"],
    "Inventory_Levels": ["product_id", "warehouse_id", "quantity_on_hand", "last_updated"],
  };

  const fetchConfig = useCallback(async () => {
    // In a real app, this would fetch from your Cloud Run config service
    const mockConfig = [
      { id: '1', entity_name: 'Sales_Report', display_name: 'Sales Report', source_of_system: 'SCM-BQ', source_details: JSON.stringify({ projectId: 'your-gcp-project', datasetId: 'sales_data', tableId: 'sales_report_2024' }) },
      { id: '2', entity_name: 'Inventory_Levels', display_name: 'Inventory Levels', source_of_system: 'SCM-BQ', source_details: JSON.stringify({ projectId: 'your-gcp-project', datasetId: 'inventory', tableId: 'current_inventory' }) },
      { id: '3', entity_name: 'Legacy_Finance_Data', display_name: 'Legacy Finance Data', source_of_system: 'SAP-BW', source_details: JSON.stringify({ queryName: 'Z_FIN_Q001' }) },
    ];
    setConfig(mockConfig);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (selectedEntity) {
      setColumns(MOCK_COLUMNS[selectedEntity.entity_name] || []);
      setSelectedColumns([]);
      setFilters([]);
      setResults(null);
    }
  }, [selectedEntity]);

  const handleEntityChange = (entityName) => {
    const entity = config.find(c => c.entity_name === entityName);
    setSelectedEntity(entity);
  };

  const handleColumnToggle = (columnName) => {
    setSelectedColumns(prev =>
      prev.includes(columnName)
        ? prev.filter(c => c !== columnName)
        : [...prev, columnName]
    );
  };

  const handleAddFilter = () => {
    if (columns.length > 0) {
      setFilters([...filters, { column: columns[0], operator: '=', value: '' }]);
    }
  };

  const handleFilterChange = (index, field, value) => {
    const newFilters = [...filters];
    newFilters[index][field] = value;
    setFilters(newFilters);
  };
  
  const handleRemoveFilter = (index) => {
    setFilters(filters.filter((_, i) => i !== index));
  };


  const executeQuery = async () => {
    if (!selectedEntity || selectedColumns.length === 0) {
      setError("Please select an entity and at least one column.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      if (selectedEntity.source_of_system === 'SCM-BQ') {
        console.log("Querying BigQuery...");
        const sourceDetails = JSON.parse(selectedEntity.source_details);
        const payload = {
          projectId: sourceDetails.projectId,
          datasetId: sourceDetails.datasetId,
          tableId: sourceDetails.tableId,
          columns: selectedColumns,
          filters: filters,
          limit: 1000
        };
        
        // Mock Response
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockData = {
            success: true,
            data: Array.from({ length: 5 }, (_, i) => 
                selectedColumns.reduce((acc, col) => {
                    acc[col] = `${col}_value_${i + 1}`;
                    return acc;
                }, {})
            )
        };


        if (mockData.success) {
          setResults(mockData.data);
        } else {
          setError(mockData.error || "An unknown error occurred.");
        }
      } else if (selectedEntity.source_of_system === 'SAP-BW') {
        console.log("Querying SAP-BW via Apigee...");
        await new Promise(resolve => setTimeout(resolve, 1500));
        setResults([{ note: "Data from SAP-BW would be displayed here." }]);
      }
    } catch (err) {
      setError("Failed to fetch data. " + err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveEntity = (entityData) => {
      if (editingEntity) {
          setConfig(config.map(e => e.id === entityData.id ? entityData : e));
      } else {
          setConfig([...config, { ...entityData, id: (config.length + 1).toString() }]);
      }
      setAdminModalOpen(false);
      setEditingEntity(null);
  };
  
  const handleEditEntity = (entity) => {
      setEditingEntity(entity);
      setAdminModalOpen(true);
  };
  
  const handleDeleteEntity = (entityId) => {
      if (window.confirm("Are you sure you want to delete this entity?")) {
        setConfig(config.filter(e => e.id !== entityId));
      }
  };


  const QueryBuilder = () => (
    <div className="space-y-6">
      <div className="p-6 bg-white rounded-xl shadow-md border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">1. Select Data Entity</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {config.map(c => (
            <button
              key={c.entity_name}
              onClick={() => handleEntityChange(c.entity_name)}
              className={`p-4 rounded-lg text-left transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-blue-400 ${
                selectedEntity?.entity_name === c.entity_name
                  ? 'bg-blue-600 text-white shadow-lg transform -translate-y-1'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <p className="font-bold text-lg">{c.display_name}</p>
              <p className={`text-sm ${selectedEntity?.entity_name === c.entity_name ? 'text-blue-200' : 'text-gray-500'}`}>
                Source: {c.source_of_system}
              </p>
            </button>
          ))}
        </div>
      </div>

      {selectedEntity && (
        <>
          <div className="p-6 bg-white rounded-xl shadow-md border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">2. Select Columns</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {columns.map(col => (
                <label
                  key={col}
                  className={`flex items-center space-x-2 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedColumns.includes(col) ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col)}
                    onChange={() => handleColumnToggle(col)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium">{col}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="p-6 bg-white rounded-xl shadow-md border border-gray-200">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">3. Add Filters (Optional)</h2>
                <button 
                  onClick={handleAddFilter}
                  className="flex items-center px-4 py-2 bg-green-500 text-white font-semibold rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 transition-transform transform hover:scale-105"
                >
                  <Plus size={18} className="mr-2"/> Add Filter
                </button>
            </div>
            <div className="space-y-4">
              {filters.map((filter, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-9 gap-2 items-center p-3 bg-gray-50 rounded-lg">
                  <select
                    value={filter.column}
                    onChange={e => handleFilterChange(index, 'column', e.target.value)}
                    className="md:col-span-3 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  >
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                  <select
                    value={filter.operator}
                    onChange={e => handleFilterChange(index, 'operator', e.target.value)}
                    className="md:col-span-2 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  >
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<=">&lt;=</option>
                    <option value="IN">IN</option>
                    <option value="NOT IN">NOT IN</option>
                  </select>
                  <input
                    type="text"
                    value={filter.value}
                    onChange={e => handleFilterChange(index, 'value', e.target.value)}
                    placeholder="Value"
                    className="md:col-span-3 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button onClick={() => handleRemoveFilter(index)} className="md:col-span-1 flex justify-center items-center text-red-500 hover:text-red-700">
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={executeQuery}
              disabled={isLoading}
              className="flex items-center justify-center w-full md:w-auto px-12 py-4 bg-blue-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-400 focus:ring-opacity-75 transition-all duration-200 transform hover:scale-105 disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Executing...
                  </>
              ) : (
                <>
                  Execute Query <ArrowRight className="ml-3"/>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );

  const AdminView = () => (
    <div className="p-6 bg-white rounded-xl shadow-md border border-gray-200">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800">Admin Configuration</h2>
            <button 
                onClick={() => { setEditingEntity(null); setAdminModalOpen(true); }}
                className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-transform transform hover:scale-105"
            >
                <Plus size={18} className="mr-2"/> New Entity
            </button>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source System</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {config.map(entity => (
                        <tr key={entity.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entity.display_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{entity.entity_name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${entity.source_of_system === 'SCM-BQ' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                    {entity.source_of_system}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center space-x-4">
                                    <button onClick={() => handleEditEntity(entity)} className="text-blue-600 hover:text-blue-900 flex items-center"><Edit size={16} className="mr-1"/> Edit</button>
                                    <button onClick={() => handleDeleteEntity(entity.id)} className="text-red-600 hover:text-red-900 flex items-center"><Trash2 size={16} className="mr-1"/> Delete</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        {adminModalOpen && <AdminModal entity={editingEntity} onSave={handleSaveEntity} onClose={() => setAdminModalOpen(false)} />}
    </div>
  );

  const AdminModal = ({ entity, onSave, onClose }) => {
    const [formData, setFormData] = useState(
      entity || {
        display_name: '',
        entity_name: '',
        source_of_system: 'SCM-BQ',
        source_details: '{}'
      }
    );
  
    const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
    };
  
    const handleSubmit = (e) => {
      e.preventDefault();
      try {
        JSON.parse(formData.source_details);
        onSave(formData);
      } catch (error) {
        alert("Source Details must be valid JSON.");
      }
    };
  
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-2xl transform transition-all">
          <h3 className="text-2xl font-bold mb-6">{entity ? 'Edit Entity' : 'Create New Entity'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <input type="text" name="display_name" value={formData.display_name} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Entity Name (unique identifier)</label>
              <input type="text" name="entity_name" value={formData.entity_name} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 font-mono"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Source of System</label>
              <select name="source_of_system" value={formData.source_of_system} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                <option>SCM-BQ</option>
                <option>SAP-BW</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Source Details (JSON)</label>
              <textarea name="source_details" rows="4" value={formData.source_details} onChange={handleChange} required className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md py-2 px-3 focus:ring-blue-500 focus:border-blue-500 font-mono"></textarea>
            </div>
            <div className="flex justify-end space-x-3 pt-4">
              <button type="button" onClick={onClose} className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300">Cancel</button>
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Save</button>
            </div>
          </form>
        </div>
      </div>
    );
  };
  

  const ResultsTable = () => (
    <div className="p-6 bg-white rounded-xl shadow-md border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Query Results</h2>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {results && results.length > 0 && Object.keys(results[0]).map(key => (
                            <th key={key} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{key}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {results && results.map((row, index) => (
                        <tr key={index}>
                            {Object.values(row).map((value, i) => (
                                <td key={i} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{typeof value === 'object' ? JSON.stringify(value) : value}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {results && results.length === 0 && <p className="text-center py-4 text-gray-500">No results found.</p>}
        </div>
    </div>
);

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
                <div className="flex items-center space-x-4">
                    <svg className="h-10 w-10 text-blue-600" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z"/>
                        <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3" />
                        <line x1="12" y1="12" x2="20" y2="7.5" />
                        <line x1="12" y1="12" x2="12" y2="21" />
                        <line x1="12" y1="12" x2="4" y2="7.5" />
                        <line x1="16" y1="5.25" x2="8" y2="9.75" />
                    </svg>
                    <h1 className="text-2xl font-bold text-gray-800">Hybrid Data Explorer</h1>
                </div>
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={() => setView(view === 'query' ? 'admin' : 'query')}
                        className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        title={view === 'query' ? "Admin Settings" : "Query Builder"}
                    >
                       {view === 'query' ? <Settings size={24} /> : <HelpCircle size={24} />}
                    </button>
                    <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-600">user@example.com</span>
                        <div className="ml-3 h-8 w-8 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 font-bold">
                           U
                        </div>
                    </div>
                </div>
            </div>
            <nav className="flex space-x-4">
                <button onClick={() => setView('query')} className={`px-3 py-2 font-medium text-sm rounded-md ${view === 'query' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    Query Builder
                </button>
                <button onClick={() => setView('admin')} className={`px-3 py-2 font-medium text-sm rounded-md ${view === 'admin' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    Admin
                </button>
            </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'query' ? <QueryBuilder /> : <AdminView />}
        {error && <div className="mt-6 p-4 bg-red-100 text-red-800 rounded-lg shadow-md">{error}</div>}
        {results && view === 'query' && <div className="mt-8"><ResultsTable /></div>}
      </main>
    </div>
  );
};

export default App;

