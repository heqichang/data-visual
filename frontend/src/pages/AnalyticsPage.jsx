import React, { useState } from 'react'
import {
  Card,
  Button,
  Space,
  Form,
  Select,
  Input,
  InputNumber,
  message,
  Typography,
  Divider,
  Row,
  Col,
  Statistic,
  Tabs,
  Table,
  Tag,
} from 'antd'
import {
  LineChartOutlined,
  BugOutlined,
  ThunderboltOutlined,
  ClusterOutlined,
  RelationOutlined,
  BarChartOutlined,
  DashboardOutlined,
} from '@ant-design/icons'
import axios from 'axios'
import ReactECharts from 'echarts-for-react'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input
const { TabPane } = Tabs

function AnalyticsPage({ datasetId, data, columns }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [activeTab, setActiveTab] = useState('trend')
  const [form] = Form.useForm()
  const [chartOption, setChartOption] = useState(null)

  const numericColumns = columns?.filter(col => {
    const val = data?.[0]?.[col]
    return typeof val === 'number'
  }) || []

  const dateColumns = columns?.filter(col => {
    const val = data?.[0]?.[col]
    return typeof val === 'string' && /\d{4}-\d{2}-\d{2}/.test(val)
  }) || []

  const runAnalysis = async (analysisType, values) => {
    if (!datasetId) {
      message.error('请先选择数据集')
      return
    }

    setLoading(true)
    setResult(null)
    setChartOption(null)
    
    try {
      const payload = {
        dataset_id: datasetId,
        ...values,
      }

      const response = await axios.post(
        `http://localhost:8000/api/analytics/${analysisType}`,
        payload
      )

      if (response.data.status === 'success') {
        setResult(response.data)
        generateChart(response.data, analysisType, values)
        message.success('分析完成')
      } else {
        message.error(response.data.error || '分析失败')
      }
    } catch (error) {
      message.error('分析失败: ' + (error.response?.data?.detail || error.message))
    }
    setLoading(false)
  }

  const generateChart = (data, type, params) => {
    let option = null

    if (type === 'trend') {
      const trendData = data.trend || data.data || []
      option = {
        title: { text: '趋势分析' },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: trendData.map((_, i) => i + 1)
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: '原始数据',
            type: 'line',
            data: data.original_data || [],
            symbol: 'circle',
            lineStyle: { type: 'dotted' }
          },
          {
            name: '趋势线',
            type: 'line',
            data: trendData,
            smooth: true,
            lineStyle: { width: 3 }
          }
        ]
      }
    } else if (type === 'anomaly') {
      const anomalyData = data.anomalies || []
      option = {
        title: { text: '异常检测' },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: (data.original_data || []).map((_, i) => i + 1)
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: '数据',
            type: 'scatter',
            data: (data.original_data || []).map((v, i) => {
              const isAnomaly = anomalyData.some(a => a.index === i)
              return {
                value: [i + 1, v],
                itemStyle: {
                  color: isAnomaly ? '#ff4d4f' : '#1890ff'
                },
                symbolSize: isAnomaly ? 12 : 6
              }
            })
          }
        ]
      }
    } else if (type === 'forecast') {
      const forecastData = data.forecast || []
      option = {
        title: { text: '时间序列预测' },
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: forecastData.map(d => d.period)
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: '历史数据',
            type: 'line',
            data: data.history_data?.map(d => d.value) || [],
            color: '#1890ff'
          },
          {
            name: '预测值',
            type: 'line',
            data: forecastData.map(d => d.value),
            color: '#52c41a',
            lineStyle: { type: 'dashed' }
          }
        ]
      }
    } else if (type === 'clustering') {
      const clusters = data.clusters || []
      const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16']
      
      option = {
        title: { text: '聚类分析' },
        tooltip: { trigger: 'item' },
        xAxis: { type: 'value', name: params.columns?.[0] || 'X' },
        yAxis: { type: 'value', name: params.columns?.[1] || 'Y' },
        series: clusters.map((cluster, idx) => ({
          name: `Cluster ${idx + 1}`,
          type: 'scatter',
          data: cluster.points,
          itemStyle: { color: colors[idx % colors.length] },
          symbolSize: 10
        }))
      }
    } else if (type === 'correlation') {
      const matrix = data.correlation_matrix || []
      const cols = data.columns || []
      
      option = {
        title: { text: '相关性热力图' },
        tooltip: {
          position: 'top',
          formatter: (params) => {
            return `${cols[params.data[0]]} vs ${cols[params.data[1]]}<br/>相关系数: ${params.data[2].toFixed(3)}`
          }
        },
        grid: { height: '60%', top: '10%' },
        xAxis: {
          type: 'category',
          data: cols,
          splitArea: { show: true }
        },
        yAxis: {
          type: 'category',
          data: cols,
          splitArea: { show: true }
        },
        visualMap: {
          min: -1,
          max: 1,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: '5%',
          inRange: {
            color: ['#52c41a', '#fff', '#ff4d4f']
          }
        },
        series: [{
          name: '相关性',
          type: 'heatmap',
          data: matrix.flatMap((row, i) => 
            row.map((val, j) => [i, j, val])
          ),
          label: {
            show: true,
            formatter: (params) => params.data[2].toFixed(2)
          }
        }]
      }
    }

    setChartOption(option)
  }

  const renderTrendAnalysis = () => (
    <Card title="趋势分析">
      <Form layout="vertical" onFinish={(values) => runAnalysis('trend', values)}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="column" label="分析列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => (
                  <Option key={col} value={col}>{col}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="method" label="分析方法" initialValue="linear_regression">
              <Select>
                <Option value="linear_regression">线性回归</Option>
                <Option value="moving_average">移动平均</Option>
                <Option value="exponential_smoothing">指数平滑</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="window_size" label="窗口大小（移动平均）">
              <InputNumber min={1} defaultValue={5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            执行分析
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )

  const renderAnomalyDetection = () => (
    <Card title="异常检测">
      <Form layout="vertical" onFinish={(values) => runAnalysis('anomaly', values)}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="column" label="分析列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => (
                  <Option key={col} value={col}>{col}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="method" label="检测方法" initialValue="zscore">
              <Select>
                <Option value="zscore">Z-Score</Option>
                <Option value="iqr">IQR</Option>
                <Option value="isolation_forest">Isolation Forest</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="threshold" label="阈值" initialValue={3}>
              <InputNumber step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            执行检测
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )

  const renderForecasting = () => (
    <Card title="时间序列预测">
      <Form layout="vertical" onFinish={(values) => runAnalysis('forecast', values)}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="date_column" label="时间列" rules={[{ required: true }]}>
              <Select placeholder="选择时间列">
                {dateColumns.map(col => (
                  <Option key={col} value={col}>{col}</Option>
                ))}
                {numericColumns.map(col => (
                  <Option key={col} value={col}>{col}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="value_column" label="预测列" rules={[{ required: true }]}>
              <Select placeholder="选择数值列">
                {numericColumns.map(col => (
                  <Option key={col} value={col}>{col}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="method" label="预测方法" initialValue="arima">
              <Select>
                <Option value="arima">ARIMA</Option>
                <Option value="prophet">Prophet</Option>
                <Option value="exponential_smoothing">指数平滑</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="periods" label="预测周期数" initialValue={10}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            执行预测
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )

  const renderClustering = () => (
    <Card title="聚类分析">
      <Form layout="vertical" onFinish={(values) => runAnalysis('clustering', values)}>
        <Form.Item name="columns" label="分析列" rules={[{ required: true }]}>
          <Select mode="multiple" placeholder="选择数值列（建议2-3个）">
            {numericColumns.map(col => (
              <Option key={col} value={col}>{col}</Option>
            ))}
          </Select>
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="method" label="聚类方法" initialValue="kmeans">
              <Select>
                <Option value="kmeans">K-Means</Option>
                <Option value="dbscan">DBSCAN</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="n_clusters" label="聚类数" initialValue={3}>
              <InputNumber min={2} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            执行聚类
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )

  const renderCorrelation = () => (
    <Card title="相关性分析">
      <Form layout="vertical" onFinish={(values) => runAnalysis('correlation', values)}>
        <Form.Item name="columns" label="分析列">
          <Select mode="multiple" placeholder="选择数值列（留空则分析所有）">
            {numericColumns.map(col => (
              <Option key={col} value={col}>{col}</Option>
            ))}
          </Select>
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="method" label="相关性方法" initialValue="pearson">
              <Select>
                <Option value="pearson">Pearson</Option>
                <Option value="spearman">Spearman</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            计算相关性
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )

  const renderResult = () => {
    if (!result) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
          执行分析后显示结果
        </div>
      )
    }

    return (
      <div>
        {result.summary && (
          <Card title="分析摘要" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              {Object.entries(result.summary).map(([key, value]) => (
                <Col key={key} span={6}>
                  <Statistic 
                    title={key.replace(/_/g, ' ')} 
                    value={typeof value === 'number' ? value.toFixed(4) : value} 
                  />
                </Col>
              ))}
            </Row>
          </Card>
        )}

        {chartOption && (
          <Card title="可视化" style={{ marginBottom: 16 }}>
            <ReactECharts option={chartOption} style={{ height: 400 }} />
          </Card>
        )}

        {result.anomalies && result.anomalies.length > 0 && (
          <Card title="检测到的异常点">
            <Table
              dataSource={result.anomalies}
              rowKey="index"
              pagination={{ pageSize: 10 }}
              columns={[
                { title: '索引', dataIndex: 'index', key: 'index' },
                { title: '值', dataIndex: 'value', key: 'value', render: v => v.toFixed(4) },
                { title: '得分', dataIndex: 'score', key: 'score', render: v => v.toFixed(4) },
                { 
                  title: '严重程度', 
                  dataIndex: 'severity', 
                  key: 'severity',
                  render: s => (
                    <Tag color={s === 'high' ? 'red' : s === 'medium' ? 'orange' : 'blue'}>
                      {s}
                    </Tag>
                  )
                }
              ]}
            />
          </Card>
        )}

        {result.forecast && (
          <Card title="预测结果">
            <Table
              dataSource={result.forecast}
              rowKey="period"
              pagination={{ pageSize: 10 }}
              columns={[
                { title: '周期', dataIndex: 'period', key: 'period' },
                { title: '预测值', dataIndex: 'value', key: 'value', render: v => v.toFixed(4) },
                { title: '下界', dataIndex: 'lower', key: 'lower', render: v => v?.toFixed(4) || '-' },
                { title: '上界', dataIndex: 'upper', key: 'upper', render: v => v?.toFixed(4) || '-' },
              ]}
            />
          </Card>
        )}

        {result.correlation_matrix && (
          <Card title="相关性矩阵">
            <Table
              dataSource={result.correlation_matrix.map((row, i) => ({
                key: i,
                column: result.columns[i],
                ...Object.fromEntries(result.columns.map((col, j) => [col, row[j]]))
              }))}
              rowKey="column"
              pagination={false}
              scroll={{ x: 'max-content' }}
              columns={[
                { title: '列', dataIndex: 'column', key: 'column', fixed: 'left' },
                ...result.columns.map(col => ({
                  title: col,
                  dataIndex: col,
                  key: col,
                  render: v => v.toFixed(3)
                }))
              ]}
            />
          </Card>
        )}

        {result.clusters && (
          <Card title="聚类结果">
            <Row gutter={16}>
              {result.clusters.map((cluster, idx) => (
                <Col key={idx} span={8}>
                  <Card size="small" title={`Cluster ${idx + 1}`}>
                    <p>样本数: {cluster.size}</p>
                    <p>中心: {JSON.stringify(cluster.center)}</p>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <BarChartOutlined />
            <span>高级分析</span>
          </Space>
        }
      >
        <Row gutter={16}>
          <Col span={8}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              tabPosition="left"
              style={{ minHeight: 500 }}
            >
              <TabPane tab={<Space><LineChartOutlined />趋势分析</Space>} key="trend">
                {renderTrendAnalysis()}
              </TabPane>
              <TabPane tab={<Space><BugOutlined />异常检测</Space>} key="anomaly">
                {renderAnomalyDetection()}
              </TabPane>
              <TabPane tab={<Space><ThunderboltOutlined />时间序列预测</Space>} key="forecast">
                {renderForecasting()}
              </TabPane>
              <TabPane tab={<Space><ClusterOutlined />聚类分析</Space>} key="clustering">
                {renderClustering()}
              </TabPane>
              <TabPane tab={<Space><RelationOutlined />相关性分析</Space>} key="correlation">
                {renderCorrelation()}
              </TabPane>
            </Tabs>
          </Col>
          <Col span={16}>
            <Card title="分析结果">
              {renderResult()}
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}

export default AnalyticsPage
