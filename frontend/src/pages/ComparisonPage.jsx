import React, { useState } from 'react'
import { Row, Col, Card, Form, Select, Input, Button, message, Spin, Space, Tabs, Table, Divider, Statistic } from 'antd'
import { ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import axios from 'axios'

const { TabPane } = Tabs
const { Option } = Select

const comparisonTypes = [
  { value: 'time_period', label: '时间段对比' },
  { value: 'group', label: '分组对比 (A/B)' },
]

const timePeriodTypes = [
  { value: 'year_over_year', label: '同比 (YoY)' },
  { value: 'month_over_month', label: '环比 (MoM)' },
  { value: 'week_over_week', label: '周环比 (WoW)' },
]

function ComparisonPage({ datasetId, datasetInfo }) {
  const [activeTab, setActiveTab] = useState('time_period')
  const [loading, setLoading] = useState(false)
  const [comparisonData, setComparisonData] = useState(null)
  const [form] = Form.useForm()

  const columns = datasetInfo?.columns || []
  const numericColumns = columns.filter(col => datasetInfo?.info?.column_types?.[col] === 'numeric')
  const categoricalColumns = columns.filter(col => 
    datasetInfo?.info?.column_types?.[col] === 'text' || datasetInfo?.info?.column_types?.[col] === 'boolean'
  )
  const dateColumns = columns.filter(col => datasetInfo?.info?.column_types?.[col] === 'date')

  const runComparison = async (type) => {
    const values = form.getFieldsValue()
    setLoading(true)
    try {
      let config = {}
      
      if (type === 'time_period') {
        config = {
          date_column: values.dateColumn,
          value_column: values.valueColumn,
          period_type: values.periodType,
        }
      } else {
        config = {
          group_column: values.groupColumn,
          group_a_value: values.groupAValue,
          group_b_value: values.groupBValue,
          value_columns: values.valueColumns || [values.valueColumn],
        }
      }

      const response = await axios.post('http://localhost:8000/api/comparison', {
        dataset_id: datasetId,
        comparison_type: type,
        config,
      })
      setComparisonData(response.data)
    } catch (error) {
      message.error('对比分析失败: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }

  const getTimePeriodChart = () => {
    if (!comparisonData || !comparisonData.time_period_data) return {}

    const data = comparisonData.time_period_data
    const categories = data.map(d => d.period)
    const currentValues = data.map(d => d.current)
    const previousValues = data.map(d => d.previous)
    const growthRates = data.map(d => d.growth_rate * 100)

    return {
      title: { text: '时间段对比分析', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      legend: { data: ['当期', '上期', '增长率'], top: 30 },
      xAxis: { type: 'category', data: categories },
      yAxis: [
        { type: 'value', name: '数值', position: 'left' },
        { type: 'value', name: '增长率 (%)', position: 'right', axisLabel: { formatter: '{value}%' } },
      ],
      series: [
        {
          name: '当期',
          type: 'bar',
          data: currentValues,
          itemStyle: { color: '#1890ff' },
        },
        {
          name: '上期',
          type: 'bar',
          data: previousValues,
          itemStyle: { color: '#d9d9d9' },
        },
        {
          name: '增长率',
          type: 'line',
          yAxisIndex: 1,
          data: growthRates,
          itemStyle: { color: '#52c41a' },
          smooth: true,
        },
      ],
    }
  }

  const getGroupComparisonChart = () => {
    if (!comparisonData || !comparisonData.group_data) return {}

    const data = comparisonData.group_data
    const categories = data.map(d => d.metric)
    const groupAValues = data.map(d => d.group_a)
    const groupBValues = data.map(d => d.group_b)
    const differences = data.map(d => d.difference)

    return {
      title: { text: '分组对比分析 (A/B)', left: 'center' },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['A组', 'B组', '差异'], top: 30 },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'value' },
      yAxis: { type: 'category', data: categories },
      series: [
        {
          name: 'A组',
          type: 'bar',
          stack: 'total',
          label: { show: true },
          data: groupAValues,
          itemStyle: { color: '#1890ff' },
        },
        {
          name: 'B组',
          type: 'bar',
          stack: 'total',
          label: { show: true },
          data: groupBValues,
          itemStyle: { color: '#52c41a' },
        },
      ],
    }
  }

  const getButterflyChart = () => {
    if (!comparisonData || !comparisonData.group_data) return {}

    const data = comparisonData.group_data
    const categories = data.map(d => d.metric)
    const groupAValues = data.map(d => -d.group_a)
    const groupBValues = data.map(d => d.group_b)

    return {
      title: { text: '蝴蝶图对比', left: 'center' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const name = params[0].name
          let result = `${name}<br/>`
          params.forEach(p => {
            result += `${p.marker} ${p.seriesName}: ${Math.abs(p.value)}<br/>`
          })
          return result
        },
      },
      legend: { data: ['A组', 'B组'], top: 30 },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { formatter: (val) => Math.abs(val) },
      },
      yAxis: {
        type: 'category',
        data: categories,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: true },
      },
      series: [
        {
          name: 'A组',
          type: 'bar',
          data: groupAValues,
          barWidth: '40%',
          itemStyle: { color: '#1890ff' },
        },
        {
          name: 'B组',
          type: 'bar',
          data: groupBValues,
          barWidth: '40%',
          itemStyle: { color: '#52c41a' },
        },
      ],
    }
  }

  const renderTimePeriodForm = () => (
    <Form form={form} layout="vertical">
      <Form.Item name="dateColumn" label="日期列" rules={[{ required: true }]}>
        <Select placeholder="选择日期列">
          {dateColumns.length > 0 
            ? dateColumns.map(col => <Option key={col} value={col}>{col}</Option>)
            : columns.map(col => <Option key={col} value={col}>{col}</Option>)
          }
        </Select>
      </Form.Item>
      <Form.Item name="valueColumn" label="数值列" rules={[{ required: true }]}>
        <Select placeholder="选择数值列">
          {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
        </Select>
      </Form.Item>
      <Form.Item name="periodType" label="对比类型" rules={[{ required: true }]}>
        <Select placeholder="选择对比类型">
          {timePeriodTypes.map(type => (
            <Option key={type.value} value={type.value}>{type.label}</Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item>
        <Button 
          type="primary" 
          onClick={() => runComparison('time_period')} 
          loading={loading} 
          block
          icon={<ReloadOutlined />}
        >
          运行对比分析
        </Button>
      </Form.Item>
    </Form>
  )

  const renderGroupComparisonForm = () => (
    <Form form={form} layout="vertical">
      <Form.Item name="groupColumn" label="分组列" rules={[{ required: true }]}>
        <Select placeholder="选择分组列">
          {categoricalColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
        </Select>
      </Form.Item>
      <Form.Item name="groupAValue" label="A组值" rules={[{ required: true }]}>
        <Input placeholder="输入A组值" />
      </Form.Item>
      <Form.Item name="groupBValue" label="B组值" rules={[{ required: true }]}>
        <Input placeholder="输入B组值" />
      </Form.Item>
      <Form.Item name="valueColumns" label="比较的数值列" rules={[{ required: true }]}>
        <Select mode="multiple" placeholder="选择要比较的数值列">
          {numericColumns.map(col => <Option key={col} value={col}>{col}</Option>)}
        </Select>
      </Form.Item>
      <Form.Item>
        <Button 
          type="primary" 
          onClick={() => runComparison('group')} 
          loading={loading} 
          block
          icon={<ReloadOutlined />}
        >
          运行对比分析
        </Button>
      </Form.Item>
    </Form>
  )

  const renderSummaryStats = () => {
    if (!comparisonData) return null

    if (comparisonData.summary) {
      const summary = comparisonData.summary
      return (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总差异"
                value={summary.total_difference}
                precision={2}
                valueStyle={{ color: summary.total_difference >= 0 ? '#3f8600' : '#cf1322' }}
                prefix={summary.total_difference >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平均差异"
                value={summary.avg_difference}
                precision={2}
                valueStyle={{ color: summary.avg_difference >= 0 ? '#3f8600' : '#cf1322' }}
                prefix={summary.avg_difference >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="最大差异"
                value={summary.max_difference}
                precision={2}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="最小差异"
                value={summary.min_difference}
                precision={2}
              />
            </Card>
          </Col>
        </Row>
      )
    }
    return null
  }

  const renderComparisonTable = () => {
    if (!comparisonData) return null

    let data = []
    let columns = []

    if (comparisonData.time_period_data) {
      data = comparisonData.time_period_data
      columns = [
        { title: '时间段', dataIndex: 'period', key: 'period' },
        { title: '当期', dataIndex: 'current', key: 'current', render: (val) => val?.toFixed(2) },
        { title: '上期', dataIndex: 'previous', key: 'previous', render: (val) => val?.toFixed(2) },
        { title: '差异', dataIndex: 'difference', key: 'difference', 
          render: (val) => (
            <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f' }}>
              {val >= 0 ? '+' : ''}{val?.toFixed(2)}
            </span>
          )
        },
        { title: '增长率', dataIndex: 'growth_rate', key: 'growth_rate',
          render: (val) => (
            <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f' }}>
              {val >= 0 ? '+' : ''}{(val * 100)?.toFixed(2)}%
            </span>
          )
        },
      ]
    } else if (comparisonData.group_data) {
      data = comparisonData.group_data
      columns = [
        { title: '指标', dataIndex: 'metric', key: 'metric' },
        { title: 'A组', dataIndex: 'group_a', key: 'group_a', render: (val) => val?.toFixed(2) },
        { title: 'B组', dataIndex: 'group_b', key: 'group_b', render: (val) => val?.toFixed(2) },
        { title: '差异', dataIndex: 'difference', key: 'difference',
          render: (val) => (
            <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f' }}>
              {val >= 0 ? '+' : ''}{val?.toFixed(2)}
            </span>
          )
        },
        { title: '差异百分比', dataIndex: 'difference_percent', key: 'difference_percent',
          render: (val) => (
            <span style={{ color: val >= 0 ? '#52c41a' : '#ff4d4f' }}>
              {val >= 0 ? '+' : ''}{(val * 100)?.toFixed(2)}%
            </span>
          )
        },
      ]
    }

    return (
      <Card title="对比详情" style={{ marginTop: 16 }}>
        <Table
          columns={columns}
          dataSource={data.map((d, i) => ({ ...d, key: i }))}
          pagination={false}
          size="small"
        />
      </Card>
    )
  }

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card title="对比配置">
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <TabPane tab="时间段对比" key="time_period">
                {renderTimePeriodForm()}
              </TabPane>
              <TabPane tab="分组对比" key="group">
                {renderGroupComparisonForm()}
              </TabPane>
            </Tabs>
          </Card>
        </Col>
        <Col span={18}>
          {renderSummaryStats()}
          <Card title="对比图表">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
            ) : comparisonData ? (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <ReactECharts
                  option={activeTab === 'time_period' ? getTimePeriodChart() : getGroupComparisonChart()}
                  style={{ height: 400 }}
                />
                {activeTab === 'group' && (
                  <ReactECharts
                    option={getButterflyChart()}
                    style={{ height: 400 }}
                  />
                )}
              </Space>
            ) : (
              <div style={{ textAlign: 'center', padding: 100, color: '#999' }}>
                请在左侧配置对比参数并点击"运行对比分析"
              </div>
            )}
          </Card>
          {renderComparisonTable()}
        </Col>
      </Row>
    </div>
  )
}

export default ComparisonPage
