export const renderIndexView = (
    storeId: string,
    state: any,
    formattedBytes: string
  ) => {
    return `
      <div style="border: 1px solid #ddd; border-radius: 10px; margin-bottom: 20px; padding: 20px; background-color: #f9f9f9;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="max-width: 70%;">
            <h2 style="margin: 0; font-size: 1.5em; color: #333;">${
              state.metadata.label || "No Label"
            }</h2>
            <p style="margin: 5px 0 10px 0; color: #777;">${
              state.metadata.description || "No Description Available"
            }</p>
            <p style="margin: 0; font-size: 0.9em; color: #555;">Store ID: <a href="/${storeId}" style="color: #007BFF; text-decoration: none;">${storeId}</a></p>
          </div>
          <div style="text-align: right; min-width: 100px;">
            <p style="margin: 0; font-size: 1.2em; color: #333;">${formattedBytes}</p>
          </div>
        </div>
      </div>
    `;
  };
  