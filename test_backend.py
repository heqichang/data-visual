"""
测试脚本 - 验证后端 API 修复
"""
import sys
import os
import io
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from main import (
    clean_value,
    clean_for_json,
    df_to_records,
    get_dataframe_info,
    infer_column_type,
    apply_filters,
    FilterConfig,
)


def test_clean_value():
    """测试数值清理函数"""
    print("测试 clean_value...")
    
    assert clean_value(np.nan) is None
    assert clean_value(None) is None
    assert clean_value(np.int64(123)) == 123
    assert clean_value(np.float64(123.45)) == 123.45
    assert clean_value(np.float64(np.inf)) is None
    assert clean_value([1, 2, 3]) == "[1, 2, 3]"
    assert clean_value({"a": 1}) == "{'a': 1}"
    assert clean_value(pd.Timestamp('2024-01-01')) == '2024-01-01T00:00:00'
    assert clean_value("hello") == "hello"
    assert clean_value(123) == 123
    
    print("  ✓ clean_value 测试通过")


def test_clean_for_json():
    """测试 JSON 序列化清理函数"""
    print("测试 clean_for_json...")
    
    test_data = {
        'int': np.int64(123),
        'float': np.float64(456.78),
        'nan': np.nan,
        'list': [np.int64(1), np.int64(2)],
        'nested': {
            'value': np.int64(999)
        }
    }
    
    result = clean_for_json(test_data)
    assert result['int'] == 123
    assert result['float'] == 456.78
    assert result['nan'] is None
    assert result['list'] == [1, 2]
    assert result['nested']['value'] == 999
    
    print("  ✓ clean_for_json 测试通过")


def test_df_to_records():
    """测试 DataFrame 转换函数"""
    print("测试 df_to_records...")
    
    df = pd.DataFrame({
        'a': [1, np.nan, 3],
        'b': ['x', 'y', None],
        'c': [np.int64(10), np.int64(20), np.int64(30)]
    })
    
    records = df_to_records(df)
    assert len(records) == 3
    assert records[0]['a'] == 1.0
    assert records[1]['a'] is None
    assert records[2]['b'] is None
    assert records[0]['c'] == 10
    
    print("  ✓ df_to_records 测试通过")


def test_get_dataframe_info():
    """测试 DataFrame 信息获取函数"""
    print("测试 get_dataframe_info...")
    
    df = pd.DataFrame({
        'numeric': [1, 2, 3, 4, 5],
        'text': ['a', 'b', 'c', 'd', 'e'],
        'date': pd.date_range('2024-01-01', periods=5),
        'bool': [True, False, True, False, True]
    })
    
    info = get_dataframe_info(df)
    assert info['rows'] == 5
    assert info['columns'] == 4
    assert info['column_types']['numeric'] == 'numeric'
    assert info['column_types']['text'] == 'text'
    assert info['column_types']['bool'] == 'boolean'
    assert isinstance(info['memory_usage'], int)
    
    print("  ✓ get_dataframe_info 测试通过")


def test_infer_column_type():
    """测试列类型推断函数"""
    print("测试 infer_column_type...")
    
    assert infer_column_type(pd.Series([True, False, True])) == 'boolean'
    assert infer_column_type(pd.Series([1, 2, 3, 4, 5])) == 'numeric'
    assert infer_column_type(pd.Series([1.1, 2.2, 3.3])) == 'numeric'
    assert infer_column_type(pd.Series(['a', 'b', 'c'])) == 'text'
    assert infer_column_type(pd.Series(pd.date_range('2024-01-01', periods=3))) == 'date'
    
    print("  ✓ infer_column_type 测试通过")


def test_apply_filters():
    """测试筛选应用函数"""
    print("测试 apply_filters...")
    
    df = pd.DataFrame({
        'value': [10, 20, 30, 40, 50],
        'category': ['A', 'B', 'A', 'B', 'A'],
        'date': pd.date_range('2024-01-01', periods=5)
    })
    
    filters = [
        FilterConfig(column='value', filter_type='range', value=[15, 45])
    ]
    result = apply_filters(df, filters)
    assert len(result) == 3
    assert all(result['value'] >= 15)
    assert all(result['value'] <= 45)
    
    filters2 = [
        FilterConfig(column='category', filter_type='in', value=['A'])
    ]
    result2 = apply_filters(df, filters2)
    assert len(result2) == 3
    assert all(result2['category'] == 'A')
    
    print("  ✓ apply_filters 测试通过")


def test_with_list_columns():
    """测试包含列表类型列的数据处理 - 解决 'unhashable type: list' 问题"""
    print("测试包含列表类型列的数据处理...")
    
    df = pd.DataFrame({
        'id': [1, 2, 3],
        'tags': [['a', 'b'], ['c', 'd'], ['e', 'f']],
        'value': [100, 200, 300]
    })
    
    for col in df.columns:
        if df[col].apply(lambda x: isinstance(x, (list, dict))).any():
            df[col] = df[col].apply(lambda x: str(x) if isinstance(x, (list, dict)) else x)
    
    info = get_dataframe_info(df)
    assert info is not None
    
    preview = df_to_records(df)
    assert preview is not None
    assert preview[0]['tags'] == "['a', 'b']"
    
    result = clean_for_json({'info': info, 'preview': preview})
    assert result is not None
    
    print("  ✓ 列表类型列处理测试通过")


def test_upload_simulation():
    """模拟文件上传测试"""
    print("模拟文件上传测试...")
    
    test_data = io.StringIO("""name,age,score
张三,25,85.5
李四,30,92.0
王五,28,78.5
赵六,,88.0""")
    
    df = pd.read_csv(test_data)
    
    dataset_id = 'test-id-123'
    info = get_dataframe_info(df)
    preview = df_to_records(df.head(100))
    
    result = clean_for_json({
        'dataset_id': dataset_id,
        'filename': 'test.csv',
        'info': info,
        'preview': preview,
        'columns': list(df.columns)
    })
    
    assert result['dataset_id'] == 'test-id-123'
    assert result['info']['rows'] == 4
    assert result['info']['columns'] == 3
    assert result['preview'][3]['age'] is None
    
    print("  ✓ 文件上传模拟测试通过")


def test_column_metadata():
    """测试列元数据接口 - 用于筛选器"""
    print("测试列元数据接口...")
    
    df = pd.DataFrame({
        'category': ['A', 'B', 'A', 'C', 'B'],
        'value': [10, 20, 30, 40, 50],
        'date': pd.date_range('2024-01-01', periods=5),
        'flag': [True, False, True, False, True]
    })
    
    dataset_id = 'test-meta'
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
    from main import data_store
    data_store[dataset_id] = df
    
    from main import get_column_metadata
    import asyncio
    
    async def test_meta():
        cat_meta = await get_column_metadata(dataset_id, 'category')
        assert cat_meta['type'] == 'text'
        assert 'unique_values' in cat_meta
        assert set(cat_meta['unique_values']) == {'A', 'B', 'C'}
        
        value_meta = await get_column_metadata(dataset_id, 'value')
        assert value_meta['type'] == 'numeric'
        assert value_meta['min'] == 10
        assert value_meta['max'] == 50
        
        flag_meta = await get_column_metadata(dataset_id, 'flag')
        assert flag_meta['type'] == 'boolean'
        assert 'unique_values' in flag_meta
        
        del data_store[dataset_id]
    
    asyncio.run(test_meta())
    print("  ✓ 列元数据接口测试通过")


def main():
    print("=" * 60)
    print("后端 API 修复验证测试")
    print("=" * 60)
    print()
    
    try:
        test_clean_value()
        test_clean_for_json()
        test_df_to_records()
        test_get_dataframe_info()
        test_infer_column_type()
        test_apply_filters()
        test_with_list_columns()
        test_upload_simulation()
        test_column_metadata()
        
        print()
        print("=" * 60)
        print("所有测试通过! ✓")
        print("=" * 60)
        return 0
    except Exception as e:
        print(f"\n测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
