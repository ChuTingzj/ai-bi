version: guidance-intent-agg-grain-v1

# 意图、聚合与粒度引导

冻结模板，供 guidance-ab 的 B 臂在 schema dump 之后附加。运行器从本文件读取，不在代码里内嵌可改文案。一次运行开始后不要改这个文件。

## 规则

1. 优先使用与问题匹配的事实表和过滤条件。问题在问销售额、GMV 或订单数量时，默认加上 `orders.status = 'completed'`。只有问题明确要取消订单，或明确要全部状态时，才不要加完成态过滤。

2. 聚合粒度按问题要求：按天、按周或按月。不要自行生成日历轴，也不要为没有数据的日期补零，除非问题明确要求补全日期或零填充。

3. 不要用 `daily_metrics` 代替对原始 `users` 或 `orders` 的聚合，除非问题明确在问 `daily_metrics` 这张表（点名该表，或所问指标只存在于该表，例如已经按日存好的 GMV）。新增用户、订单数和订单金额应查询 `users` 与 `orders`。

4. 客单价是订单金额合计除以订单数，不是人均消费。写法是 `SUM(amount) / COUNT(orders)`：在 `orders` 上为 `SUM(total_amount) / COUNT(*)`；明细关联订单时为 `SUM(order_items.amount) / COUNT(DISTINCT orders.id)`。不要除以 `COUNT(DISTINCT user_id)`。

5. 连接保持最少，状态过滤与问题意图一致。完成态、取消态或全部状态，在相关事实表上使用同一种读法，不要一边保留 `status = 'completed'`、另一边把其他状态算进来。不要增加会改变粒度的多余连接。
