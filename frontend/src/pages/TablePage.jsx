import React, { useState, useEffect } from 'react'
import { Card, Table, Input, Button, Space, message, Tooltip } from 'antd'
import { SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import axios from 'axios'

function TablePage({ datasetId, datasetInfo }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
  })
  const [searchText, setSearchText] = useState('')
  const [sorter, setSorter] = useState(null)

  const columns = datasetInfo?.columns || []
  const columnTypes = datasetInfo?.info?.column_types || {}

  useEffect(() => {
    loadData()
  }, [datasetId, pagination.current, pagination.pageSize, searchText, sorter])

  const loadData = async () => {
    setLoading(true)
    try {
      const params = {
        page: pagination.current,
        page_size: pagination.pageSize,
      }
      if (searchText) {
        params.search = searchText
      }
      if (sorter) {
        params.sort_by = sorter.field
        params.sort_order = sorter.order === 'ascend' ? 'asc' : 'desc'
      }

      const response = await axios.get(`/api/dataset/${datasetId}/data`, { params })
      setData(response.data.data)
      setPagination(prev => ({
        ...prev,
        total: response.data.total,
      }))
    } catch (error) {
      message.error('加载数据失败: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }

  const handleTableChange = (pagination, filters, sorter) => {
    setPagination(prev => ({
      ...prev,
      current: pagination.current,
      pageSize: pagination.pageSize,
    }))
    if (sorter.field) {
      setSorter(sorter)
    } else {
      setSorter(null)
    }
  }

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }))
    loadData()
  }

  const handleReset = () => {
    setSearchText('')
    setSorter(null)
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const exportData = async () => {
    try {
      const response = await axios.get(`/api/dataset/${datasetId}/export`)
      const blob = new Blob([response.data.data], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', response.data.filename)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      message.success('导出成功')
    } catch (error) {
      message.error('导出失败: ' + (error.response?.data?.detail || error.message))
    }
  }

  const getColumnWidth = (col) => {
    const type = columnTypes[col]
    if (type === 'numeric') return 150
    if (type === 'date') return 180
    return 200
  }

  const getConditionalColor = (value, col) => {
    if (columnTypes[col] !== 'numeric' || value === null || value === undefined) return {}
    const numValue = parseFloat(value)
    if (isNaN(numValue)) return {}
    
    if (numValue > 80) return { style: { background: '#f6ffed', color: '#52c41a' } }
    if (numValue < 20) return { style: { background: '#fff1f0', color: '#ff4d4f' } }
    return {}
  }

  const tableColumns = columns.map(col => ({
    title: (
      <Tooltip title={`${col} (${columnTypes[col]})`}>
      {col}
      </Tooltip>
    ),
    dataIndex: col,
    key: col,
    sorter: true,
    sortDirections: ['ascend', 'descend'],
    width: getColumnWidth(col),
    ellipsis: true,
    render: (text) => {
      if (text === null || text === undefined) return <span style={{ color: '#999' }}>-</span>
      const colorProps = getConditionalColor(text, col)
      return <span {...colorProps}>{String(text)}</span>
    },
  }))

  return (
    <div>
      <Card title="数据表格">
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Input
              placeholder="搜索..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 300 }}
              allowClear
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          </Space>
          <Button icon={<DownloadOutlined />} onClick={exportData}>
            导出 CSV
          </Button>
        </div>

        <Table
          columns={tableColumns}
          dataSource={data}
          rowKey={(record, index) => index}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条数据`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 'max-content', y: 600 }}
          size="small"
        />
      </Card>
    </div>
  )
}

export default TablePage
