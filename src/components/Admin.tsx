import { useState } from 'react';
import { Settings, Users, Upload, Download, Database, FileSpreadsheet } from 'lucide-react';

export const Admin = () => {
  const [showNotification, setShowNotification] = useState(false);

  const showSuccessMessage = (message: string) => {
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  const handleCreateUser = () => {
    showSuccessMessage('Usuario creado exitosamente');
  };

  const handleBulkUpload = () => {
    showSuccessMessage('Funcionalidad de carga masiva en desarrollo');
  };

  const handleExportReport = () => {
    const reportData = {
      fecha: new Date().toISOString().split('T')[0],
      totalProductos: 8,
      stockTotal: 430,
      valorInventario: 15750000
    };

    const csvContent = [
      ['Reporte de Inventario OldTree'],
      ['Fecha', reportData.fecha],
      ['Total Productos', reportData.totalProductos],
      ['Stock Total', reportData.stockTotal],
      ['Valor Inventario (CLP)', reportData.valorInventario]
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `reporte_inventario_${reportData.fecha}.csv`;
    link.click();

    showSuccessMessage('Reporte exportado exitosamente');
  };

  const handleBackupDB = () => {
    showSuccessMessage('Backup de base de datos simulado');
  };

  return (
    <div className="space-y-6">
      {showNotification && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in">
          Acción completada
        </div>
      )}

      <div className="flex items-center space-x-3">
        <div className="p-3 bg-neutral-900 text-white rounded-lg">
          <Settings size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Administración</h2>
          <p className="text-sm text-neutral-600">Configuración y herramientas del sistema</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <Users size={24} />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Gestión de Usuarios</h3>
          </div>
          <p className="text-neutral-600 mb-6">
            Crear y administrar cuentas de usuario con diferentes niveles de acceso al sistema.
          </p>
          <button
            onClick={handleCreateUser}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Crear Nuevo Usuario
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <Upload size={24} />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Carga Masiva</h3>
          </div>
          <p className="text-neutral-600 mb-6">
            Importar productos desde archivos Excel o CSV para actualizar el inventario masivamente.
          </p>
          <button
            onClick={handleBulkUpload}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
          >
            Cargar Archivo Excel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <Download size={24} />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Exportar Reportes</h3>
          </div>
          <p className="text-neutral-600 mb-6">
            Descargar reportes de inventario, ventas y stock en formato CSV para análisis externo.
          </p>
          <button
            onClick={handleExportReport}
            className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
          >
            Exportar Reporte CSV
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
              <Database size={24} />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Backup de Datos</h3>
          </div>
          <p className="text-neutral-600 mb-6">
            Realizar respaldo de la base de datos para proteger la información del sistema.
          </p>
          <button
            onClick={handleBackupDB}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition-colors"
          >
            Crear Backup
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-neutral-100 text-neutral-600 rounded-lg">
            <FileSpreadsheet size={24} />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">Configuración del Sistema</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
            <div>
              <p className="font-semibold text-neutral-900">Sincronización Automática</p>
              <p className="text-sm text-neutral-600">Actualizar stock cada 15 minutos</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
            <div>
              <p className="font-semibold text-neutral-900">Alertas de Stock Bajo</p>
              <p className="text-sm text-neutral-600">Notificar cuando stock &lt; 20 unidades</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
            <div>
              <p className="font-semibold text-neutral-900">Modo Desarrollo</p>
              <p className="text-sm text-neutral-600">Mostrar datos de debug en consola</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-neutral-900 to-neutral-800 text-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-bold mb-4">Información del Sistema</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-neutral-400 text-sm">Versión</p>
            <p className="text-xl font-bold">1.0.0</p>
          </div>
          <div>
            <p className="text-neutral-400 text-sm">Ambiente</p>
            <p className="text-xl font-bold">Desarrollo</p>
          </div>
          <div>
            <p className="text-neutral-400 text-sm">Base de Datos</p>
            <p className="text-xl font-bold">Mock</p>
          </div>
          <div>
            <p className="text-neutral-400 text-sm">Última Deploy</p>
            <p className="text-xl font-bold">05/10/25</p>
          </div>
        </div>
      </div>
    </div>
  );
};
