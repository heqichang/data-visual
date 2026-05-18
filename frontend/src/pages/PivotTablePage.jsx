import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Form, Select, Input, Button, message, Spin, Space, Table, Modal } from 'antd'
import { DownloadOutlined, SettingOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons'
import axios from 'axios'

const { Option } = Select

const aggregationTypes = [
  { value: 'sum', label: '求和 (SUM)' },
  { value: 'mean', label: '平均值 (AVG)' },
  { value: 'count', label: '计数 (COUNT)' },
  { value: 'max', label: '最大值 (MAX)' },
  { value: 'min', label: '最小值 (MIN)' },
  { value: 'median', label: '中位数 (MEDIAN)' },
]

function PivotTablePage({ datasetId, datasetInfo }) {
  const [loading, setLoading] = useState(false)
  const [pivotData, setPivotData] = useState(null)
  const [rows, setRows] = useState([])
  const [cols, setCols] = useState([])
  const [values, setValues] = useState([])
  const [showSubtotal, setShowSubtotal] = useState(true)
  const [showGrandTotal, setShowGrandTotal] = useState(true)
  const [detailModal, setDetailModal] = useState({ visible: false, data: [], rowValue: null, colValue: null })

  const columns = datasetInfo?.columns || []
  const numericColumns = columns.filter(col => datasetInfo?.info?.column_types?.[col] === 'numeric')
  const categoricalColumns = columns.filter(col => 
    datasetInfo?.info?.column_types?.[col] === 'text' || datasetInfo?.info?.column_types?.[col] === 'boolean'
  )

  const generatePivot = async () => {
    if (values.length === 0) {
      message.warning('请至少选择一个值字段')
      return
    }

    setLoading(true)
    try {
      const response = await axios.post('http://localhost:8000/api/pivot', {
        dataset_id: datasetId,
        rows,
        cols,
        values: values.map(v => ({ column: v.column, aggregation: v.aggregation })),
        show_subtotal: showSubtotal,
        show_grand_total: showGrandTotal,
      })
      setPivotData(response.data)
    } catch (error) {
      message.error('生成透视表失败: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }

  const addValueField = () => {
    if (numericColumns.length > 0) {
      setValues([...values, { column: numericColumns[0], aggregation: 'sum' }])
    }
  }

  const removeValueField = (index) => {
    setValues(values.filter((_, i) => i !== index))
  }

  const updateValueField = (index, field, value) => {
    const newValues = [...values]
    newValues[index][field] = value
    setValues(newValues)
  }

  const getTableColumns = () => {
    if (!pivotData) return []
    
    const cols = []
    
    if (pivotData.row_headers) {
      pivotData.row_headers.forEach((header, i) => {
        cols.push({
          title: header,
          dataIndex: `row_${i}`,
          key: `row_${i}`,
          fixed: 'left',
          width: 120,
        })
      })
    }
    
    if (pivotData.columns) {
      pivotData.columns.forEach((col, i) => {
        cols.push({
          title: col,
          dataIndex: `col_${i}`,
          key: `col_${i}`,
          width: 100,
          align: 'right',
          render: (text, record, rowIndex) => {
            const hasDetail = pivotData.detail_map?.[rowIndex]?.[i]
            return (
              <span 
                style={{ cursor: hasDetail ? 'pointer' : 'default', color: hasDetail ? '#1890ff' : 'inherit' }}
                onClick={() => hasDetail && showDetail(rowIndex, i, record[`row_0`], col)}
              >
                {text}
                {hasDetail && <EyeOutlined style={{ marginLeft: 4 }} />}
              </span>
            )
          },
        })
      })
    }
    
    return cols
  }

  const getTableData = () => {
    if (!pivotData || !pivotData.data) return []
    
    return pivotData.data.map((row, rowIndex) => {
      const record = { key: rowIndex }
      if (pivotData.row_headers) {
        pivotData.row_headers.forEach((_, i) => {
          record[`row_${i}`] = row[i]
        })
      }
      if (pivotData.columns) {
        const startIdx = pivotData.row_headers?.length || 0
        pivotData.columns.forEach((_, i) => {
          record[`col_${i}`] = row[startIdx + i]
        })
      }
      return record
    })
  }

  const showDetail = async (rowIndex, colIndex, rowValue, colValue) => {
    try {
      const response = await axios.post('http://localhost:8000/api/pivot/detail', {
        dataset_id: datasetId,
        rows,
        cols,
        values,
        row_index: rowIndex,
        col_index: colIndex,
      })
      setDetailModal({
        visible: true,
        data: response.data.data || [],
        rowValue,
        colValue,
      })
    } catch (error) {
      message.error('获取明细数据失败: ' + (error.response?.data?.detail || error.message))
    }
  }

  const exportPivot = async (format) => {
    try {
      const response = await axios.post('http://localhost:8000/api/pivot/export', {
        dataset_id: datasetId,
        rows,
        cols,
        values: values.map(v => ({ column: v.column, aggregation: v.aggregation })),
        format,
      }, { responseType: 'blob' })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `pivot_table.${format}`
      link.click()
      window.URL.revokeObjectURL(url)
      message.success('导出成功')
    } catch (error) {
      message.error('导出失败: ' + (error.response?.data?.detail || error.message))
    }
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card title="透视表配置">
            <Form layout="vertical">
              <Form.Item label="行字段">
                <Select
                  mode="multiple"
                  placeholder="选择行字段"
                  value={rows}
                  onChange={setRows}
                  style={{ width: '100%' }}
                >
                  {columns.map(col => (
                    <Option key={col} value={col}>{col}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="列字段">
                <Select
                  mode="multiple"
                  placeholder="选择列字段"
                  value={cols}
                  onChange={setCols}
                  style={{ width: '100%' }}
                >
                  {columns.map(col => (
                    <Option key={col} value={col}>{col}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item label="值字段">
                {values.map((val, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <Select
                      style={{ flex: 1 }}
                      value={val.column}
                      onChange={(value) => updateValueField(index, 'column', value)}
                    >
                      {numericColumns.map(col => (
                        <Option key={col} value={col}>{col}</Option>
                      ))}
                    </Select>
                    <Select
                      style={{ width: 120 }}
                      value={val.aggregation}
                      onChange={(value) => updateValueField(index, 'aggregation', value)}
                    >
                      {aggregationTypes.map(agg => (
                        <Option key={agg.value} value={agg.value}>{agg.label}</Option>
                      ))}
                    </Select>
                    <Button danger onClick={() => removeValueField(index)}>删除</Button>
                  </div>
                ))}
                <Button type="dashed" onClick={addValueField} block style={{ marginTop: 8 }}>
                  添加值字段
                </Button>
              </Form.Item>

              <Form.Item label="显示选项">
                <Space direction="vertical">
                  <div>
                    <input
                      type="checkbox"
                      checked={showSubtotal}
                      onChange={(e) => setShowSubtotal(e.target.checked)}
                      style={{ marginRight: 8 }}
                    />
                    显示小计
                  </div>
                  <div>
                    <input
                      type="checkbox"
                      checked={showGrandTotal}
                      onChange={(e) => setShowGrandTotal(e.target.checked)}
                      style={{ marginRight: 8 }}
                    />
                    显示总计
                  </div>
                </Space>
              </Form.Item>

              <Form.Item>
                <Button 
                  type="primary" 
                  onClick={generatePivot} 
                  loading={loading} 
                  block
                  icon={<ReloadOutlined />}
                >
                  生成透视表
                </Button>
              </Form.Item>
            </Form>

            {pivotData && (
              <div style={{ marginTop: 16 }}>
                <Button.Group>
                  <Button icon={<DownloadOutlined />} onClick={() => exportPivot('csv')}>导出 CSV</Button>
                  <Button icon={<DownloadOutlined />} onClick={() => exportPivot('excel')}>导出 Excel</Button>
                </Button.Group>
              </div>
            )}
          </Card>
        </Col>
        <Col span={18}>
          <Card title="透视表结果">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
            ) : pivotData ? (
              <div style={{ overflowX: 'auto' }}>
                <Table
                  columns={getTableColumns()}
                  dataSource={getTableData()}
                  pagination={false}
                  scroll={{ x: 1200, y: 500 }}
                  bordered
                  size="small"
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 100, color: '#999' }}>
                请在左侧配置透视表参数并点击"生成透视表"
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={`明细数据 - ${detailModal.rowValue} / ${detailModal.colValue}`}
        open={detailModal.visible}
        onCancel={() => setDetailModal({ ...detailModal, visible: false })}
        footer={[
          <Button key="close" onClick={() => setDetailModal({ ...detailModal, visible: false })}>
            关闭
          </Button>
        ]}
        width={1000}
      >
        <Table
          dataSource={detailModal.data}
          columns={detailModal.data[0] ? Object.keys(detailModal.data[0]).map(key => ({
            title: key,
            dataIndex: key,
            key,
          })) : []}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 900, y: 400 }}
          size="small"
        />
      </Modal>
    </div>
  )
}

export default PivotTablePage
