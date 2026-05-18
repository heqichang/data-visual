import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Table, Progress, Spin, message } from 'antd'
import ReactECharts from 'echarts-for-react'
import axios from 'axios'

function OverviewPage({ datasetId }) {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState(null)
  const [histograms, setHistograms] = useState({})

  useEffect(() => {
    loadOverview()
  }, [datasetId])

  const loadOverview = async () => {
    setLoading(true)
    try {
      const response = await axios.get(`/api/dataset/${datasetId}/overview`)
      setOverview(response.data)
      
      const numericCols = Object.keys(response.data.info.column_types).filter(
        col => response.data.info.column_types[col] === 'numeric'
      ).slice(0, 4)
      
      const histPromises = numericCols.map(col =>
        axios.get(`/api/dataset/${datasetId}/histogram/${col}`)
          .then(res => ({ col, data: res.data }))
      )
      
      const histResults = await Promise.all(histPromises)
      const histMap = {}
      histResults.forEach(({ col, data }) => {
        histMap[col] = data
      })
      setHistograms(histMap)
    } catch (error) {
      message.error('加载数据概览失败: ' + (error.response?.data?.detail || error.message))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
  }

  if (!overview) return null

  const { info, statistics, correlation, data_quality } = overview

  const columnInfoColumns = [
    {
      title: '字段名',
      dataIndex: 'column',
      key: 'column',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
    },
    {
      title: '空值数',
      dataIndex: 'null_count',
      key: 'null_count',
    },
    {
      title: '空值率',
      dataIndex: 'null_rate',
      key: 'null_rate',
      render: (rate) => `${(rate * 100).toFixed(2)}%`,
    },
    {
      title: '唯一值数',
      dataIndex: 'unique_count',
      key: 'unique_count',
    },
  ]

  const columnInfoData = Object.keys(info.column_types).map(col => ({
    key: col,
    column: col,
    type: info.column_types[col],
    null_count: info.null_counts[col],
    null_rate: info.null_rates[col],
    unique_count: info.unique_counts[col],
  }))

  const getHistogramOption = (col, data) => {
    if (!data) return {}
    return {
      title: { text: `${col} 分布`, left: 'center', textStyle: { fontSize: 14 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: data.bins.slice(0, -1).map((v, i) => `${v.toFixed(1)}-${data.bins[i + 1].toFixed(1)}`),
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: data.counts,
        itemStyle: { color: '#1890ff' },
      }],
    }
  }

  const getCategoricalChart = (col, stats) => {
    if (!stats || !stats.value_counts) return {}
    const values = Object.entries(stats.value_counts).slice(0, 10)
    return {
      title: { text: `${col} 值分布`, left: 'center', textStyle: { fontSize: 14 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: values.map(v => v[0]),
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: values.map(v => v[1]),
        itemStyle: { color: '#52c41a' },
      }],
    }
  }

  const getCorrelationOption = () => {
    if (!correlation) return {}
    return {
      title: { text: '相关性热力图', left: 'center', textStyle: { fontSize: 14 } },
      tooltip: {
        position: 'top',
        formatter: (params) => `${correlation.columns[params.value[1]]} × ${correlation.columns[params.value[0]]}: ${params.value[2].toFixed(2)}`,
      },
      grid: { height: '50%', top: '10%' },
      xAxis: {
        type: 'category',
        data: correlation.columns,
        splitArea: { show: true },
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: correlation.columns,
        splitArea: { show: true },
        axisLabel: { fontSize: 10 },
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          color: ['#5470c6', '#91cc75', '#fac858', '#ee6666'],
        },
      },
      series: [{
        type: 'heatmap',
        data: correlation.data.flatMap((row, i) =>
          row.map((value, j) => [j, i, value])
        ),
        label: { show: true, fontSize: 10, formatter: (p) => p.value[2].toFixed(2) },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.5)' },
        },
      }],
    }
  }

  const numericCols = Object.keys(info.column_types).filter(col => info.column_types[col] === 'numeric')
  const textCols = Object.keys(info.column_types).filter(col => info.column_types[col] === 'text').slice(0, 2)

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic title="数据行数" value={info.rows} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="字段数量" value={info.columns} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="内存占用" value={(info.memory_usage / 1024 / 1024).toFixed(2)} suffix="MB" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>数据质量评分</div>
              <Progress type="dashboard" percent={data_quality.score.toFixed(0)} width={80} />
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="字段信息" style={{ marginTop: 16 }}>
        <Table columns={columnInfoColumns} dataSource={columnInfoData} pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {numericCols.slice(0, 4).map(col => (
          <Col span={12} key={col}>
            <Card>
              <ReactECharts option={getHistogramOption(col, histograms[col])} style={{ height: 300 }} />
              {statistics[col] && (
                <div style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
                    <div>均值: {statistics[col].mean?.toFixed(2)}</div>
                    <div>中位数: {statistics[col].median?.toFixed(2)}</div>
                    <div>标准差: {statistics[col].std?.toFixed(2)}</div>
                    <div>最小值: {statistics[col].min?.toFixed(2)}</div>
                    <div>25%分位: {statistics[col].q25?.toFixed(2)}</div>
                    <div>75%分位: {statistics[col].q75?.toFixed(2)}</div>
                    <div>最大值: {statistics[col].max?.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {textCols.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          {textCols.map(col => (
            <Col span={12} key={col}>
              <Card>
                <ReactECharts option={getCategoricalChart(col, statistics[col])} style={{ height: 300 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {correlation && (
        <Card title="字段相关性分析" style={{ marginTop: 16 }}>
          <ReactECharts option={getCorrelationOption()} style={{ height: 500 }} />
        </Card>
      )}

      <Card title="数据质量详情" style={{ marginTop: 16 }}>
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>完整性</div>
                <Progress percent={(data_quality.completeness * 100).toFixed(1)} status="active" />
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>唯一性</div>
                <Progress percent={(data_quality.uniqueness * 100).toFixed(1)} status="active" />
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}

export default OverviewPage
