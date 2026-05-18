import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Form, Select, Slider, DatePicker, Button, Tag, message, Space, Divider, Spin } from 'antd'
import ReactECharts from 'echarts-for-react'
import axios from 'axios'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select
const { Range } = Slider

const safeFormatNumber = (num, defaultValue = '-') => {
  if (num === null || num === undefined || typeof num !== 'number') {
    return defaultValue
  }
  if (isNaN(num) || !isFinite(num)) {
    return defaultValue
  }
  try {
    return num.toLocaleString()
  } catch (e) {
    return String(num)
  }
}

function FilterPage({ datasetId, datasetInfo }) {
  const [filters, setFilters] = useState([])
  const [chartData, setChartData] = useState(null)
  const [availableFilters, setAvailableFilters] = useState([])
  const [columnMeta, setColumnMeta] = useState({})
  const [dataCount, setDataCount] = useState(0)
  const [loadingMeta, setLoadingMeta] = useState({})
  const wsRef = useRef(null)
  const isLocalUpdateRef = useRef(false)
  const [form] = Form.useForm()

  const columns = datasetInfo?.columns || []
  const columnTypes = datasetInfo?.info?.column_types || {}
  const totalRows = datasetInfo?.info?.rows || 0

  useEffect(() => {
    initAvailableFilters()
    connectWebSocket()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [datasetId])

  useEffect(() => {
    filters.forEach(filter => {
      if (!columnMeta[filter.column] && !loadingMeta[filter.column]) {
        loadColumnMeta(filter.column)
      }
    })
  }, [filters])

  useEffect(() => {
    if (filters.length >= 0) {
      loadChartData(filters)
    }
  }, [filters])

  const initAvailableFilters = () => {
    const filterList = []
    columns.forEach(col => {
      const type = columnTypes[col]
      if (type === 'numeric') {
        filterList.push({ column: col, type: 'numeric' })
      } else if (type === 'text' || type === 'boolean') {
        filterList.push({ column: col, type: 'categorical' })
      } else if (type === 'date') {
        filterList.push({ column: col, type: 'date' })
      }
    })
    setAvailableFilters(filterList)
  }

  const loadColumnMeta = async (column) => {
    if (columnMeta[column]) return columnMeta[column]
    
    setLoadingMeta(prev => ({ ...prev, [column]: true }))
    try {
      const response = await axios.get(`/api/dataset/${datasetId}/column-meta`, {
        params: { column }
      })
      setColumnMeta(prev => ({ ...prev, [column]: response.data }))
      return response.data
    } catch (error) {
      console.error('Failed to load column meta:', error)
      setColumnMeta(prev => ({ ...prev, [column]: { error: error.message } }))
      return null
    } finally {
      setLoadingMeta(prev => ({ ...prev, [column]: false }))
    }
  }

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/${datasetId}`
    wsRef.current = new WebSocket(wsUrl)

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'filter_update') {
        if (isLocalUpdateRef.current) {
          isLocalUpdateRef.current = false
          return
        }
        setFilters(data.filters)
      }
    }

    wsRef.current.onopen = () => {
      console.log('WebSocket connected')
    }

    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected')
    }
  }

  const broadcastFilters = (newFilters) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      isLocalUpdateRef.current = true
      wsRef.current.send(JSON.stringify({
        type: 'filter_update',
        filters: newFilters,
      }))
    }
  }

  const addFilter = async () => {
    const values = form.getFieldsValue()
    if (!values.column) return

    const existingFilter = filters.find(f => f.column === values.column)
    if (existingFilter) {
      message.warning('该字段已添加筛选器')
      return
    }

    const filterType = availableFilters.find(f => f.column === values.column)?.type
    let newFilter = { column: values.column, filter_type: 'in', value: [] }

    try {
      if (filterType === 'numeric') {
        newFilter.filter_type = 'range'
        const meta = await loadColumnMeta(values.column)
        if (meta && typeof meta.min === 'number' && typeof meta.max === 'number' && 
            !isNaN(meta.min) && !isNaN(meta.max) && isFinite(meta.min) && isFinite(meta.max)) {
          newFilter.value = [meta.min, meta.max]
        } else {
          newFilter.value = [0, 100]
        }
      } else if (filterType === 'categorical') {
        newFilter.filter_type = 'in'
        newFilter.value = []
        await loadColumnMeta(values.column)
      } else if (filterType === 'date') {
        newFilter.filter_type = 'date_range'
        newFilter.value = [dayjs().subtract(1, 'year').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
      }

      const newFilters = [...filters, newFilter]
      setFilters(newFilters)
      broadcastFilters(newFilters)
      form.resetFields(['column'])
    } catch (error) {
      console.error('添加筛选器失败:', error)
      message.error('添加筛选器失败，请重试')
    }
  }

  const removeFilter = (column) => {
    const newFilters = filters.filter(f => f.column !== column)
    setFilters(newFilters)
    broadcastFilters(newFilters)
  }

  const updateFilter = useCallback((column, value) => {
    setFilters(prevFilters => {
      const newFilters = prevFilters.map(f =>
        f.column === column ? { ...f, value } : f
      )
      broadcastFilters(newFilters)
      return newFilters
    })
  }, [])

  const clearFilters = () => {
    setFilters([])
    broadcastFilters([])
  }

  const loadChartData = async (currentFilters) => {
    try {
      const numericCols = columns.filter(col => columnTypes[col] === 'numeric')
      const catCols = columns.filter(col => columnTypes[col] === 'text')
      
      if (numericCols.length >= 1 && catCols.length >= 1) {
        const response = await axios.post('/api/chart', {
          dataset_id: datasetId,
          chart_type: 'bar',
          x_column: catCols[0],
          y_column: numericCols[0],
          filters: currentFilters,
        })
        setChartData(response.data)
      }

      const dataResponse = await axios.get(`/api/dataset/${datasetId}/data`, {
        params: { page: 1, page_size: 1 },
      })
      setDataCount(dataResponse.data.total)
    } catch (error) {
      console.error('Failed to load chart data:', error)
    }
  }

  const getFilterComponent = (filter) => {
    const filterType = availableFilters.find(f => f.column === filter.column)?.type
    const meta = columnMeta[filter.column]
    const isLoading = loadingMeta[filter.column] === true

    if (filterType === 'numeric') {
      const rawMin = meta?.min
      const rawMax = meta?.max
      const isValid = typeof rawMin === 'number' && typeof rawMax === 'number' && 
                     !isNaN(rawMin) && !isNaN(rawMax) && isFinite(rawMin) && isFinite(rawMax)
      
      const min = isValid ? rawMin : 0
      const max = isValid ? rawMax : 100
      const range = max - min
      const step = range > 0 ? Math.max(range / 100, 0.01) : 1
      
      return (
        <Spin spinning={isLoading}>
          <Range
            min={min}
            max={max}
            value={filter.value || [min, max]}
            onChange={(value) => {
              if (value && value.length === 2) {
                updateFilter(filter.column, value)
              }
            }}
            style={{ width: 250 }}
            step={step}
          />
          <span style={{ marginLeft: 12, fontSize: 12, color: '#666' }}>
            {safeFormatNumber(filter.value?.[0] ?? min)} - {safeFormatNumber(filter.value?.[1] ?? max)}
          </span>
        </Spin>
      )
    } else if (filterType === 'categorical') {
      const options = meta?.unique_values || []
      
      if (meta?.error) {
        return (
          <span style={{ color: '#ff4d4f' }}>
            加载失败: {meta.error}
          </span>
        )
      }
      
      return (
        <Spin spinning={isLoading}>
          <Select
            mode="multiple"
            placeholder={isLoading ? "加载中..." : options.length === 0 ? "无可选值" : "选择值（可多选）"}
            style={{ width: 300 }}
            value={filter.value}
            maxTagCount="responsive"
            showSearch
            optionFilterProp="children"
            onChange={(value) => {
              updateFilter(filter.column, value)
            }}
            allowClear
            disabled={isLoading}
          >
            {options.map(val => (
              <Option key={val} value={val}>
                {val}
              </Option>
            ))}
          </Select>
          {meta?.has_more && (
            <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>
              （仅显示前 100 个值）
            </span>
          )}
        </Spin>
      )
    } else if (filterType === 'date') {
      return (
        <RangePicker
          value={filter.value?.map(v => dayjs(v))}
          onChange={(dates) => {
            updateFilter(filter.column, dates?.map(d => d.format('YYYY-MM-DD')) || [])
          }}
          style={{ width: 280 }}
        />
      )
    }
    return null
  }

  const getChartOption = () => {
    if (!chartData) return {}
    return {
      title: { text: '筛选结果预览', left: 'center' },
      tooltip: { trigger: 'axis' },
      legend: { top: 30 },
      grid: { left: '3%', right: '4%', bottom: '3%', top: 80, containLabel: true },
      xAxis: { type: 'category', data: chartData.categories, axisLabel: { rotate: 45 } },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: chartData.data,
        itemStyle: { color: '#1890ff' },
      }],
    }
  }

  return (
    <div>
      <Card title="筛选器配置" style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline">
          <Form.Item name="column" label="添加筛选字段" rules={[{ required: true }]}>
            <Select placeholder="选择字段" style={{ width: 280 }}>
              {availableFilters.map(f => (
                <Option key={f.column} value={f.column}>
                  {f.column} ({f.type === 'numeric' ? '数值' : f.type === 'categorical' ? '分类' : '日期'})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={addFilter}>添加筛选器</Button>
          </Form.Item>
          <Form.Item>
            <Button onClick={clearFilters} danger>清空所有</Button>
          </Form.Item>
        </Form>

        <Divider />

        {filters.length > 0 ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {filters.map(filter => (
              <Card size="small" key={filter.column}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <Tag color="blue" style={{ minWidth: 100 }}>{filter.column}</Tag>
                  {getFilterComponent(filter)}
                  <Button type="text" danger onClick={() => removeFilter(filter.column)}>
                    删除
                  </Button>
                </div>
              </Card>
            ))}
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
            暂无筛选器，请添加筛选条件
          </div>
        )}

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: '#666' }}>筛选结果：</span>
            <span style={{ fontWeight: 'bold', color: '#1890ff', margin: '0 8px' }}>{dataCount}</span>
            <span style={{ color: '#666' }}> 条数据</span>
            <span style={{ color: '#999', marginLeft: 8 }}>(共 {totalRows} 条)</span>
          </div>
          <Button onClick={() => {
            localStorage.setItem('savedFilters', JSON.stringify(filters))
            message.success('筛选条件已保存')
          }}>
            保存筛选条件
          </Button>
        </div>
      </Card>

      <Card title="实时预览">
        {chartData ? (
          <ReactECharts option={getChartOption()} style={{ height: 400 }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 100, color: '#999' }}>
            选择筛选条件后图表将实时更新
          </div>
        )}
      </Card>
    </div>
  )
}

export default FilterPage
