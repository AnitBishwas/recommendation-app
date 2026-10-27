import { Router } from "express";
import clientProvider from "../../../utils/clientProvider.js";

const shopRoutes = Router();

shopRoutes.get("/product-tags", async (req, res) => {
  try {
    const shop = res.locals.user_session.shop;
    const { client } = await clientProvider.offline.graphqlClient({ shop });

    const result = await client.request(/* GraphQL */ `
      {
        productTags(first: 250) {
          edges {
            node
          }
        }
      }
    `);

    const tags = result.data.productTags.edges.map((e) => e.node);
    return res.status(200).json({ ok: true, tags });
  } catch (err) {
    console.error("Failed to fetch product tags -->" + err.message);
    return res.status(400).json({ ok: false });
  }
});

export default shopRoutes;
